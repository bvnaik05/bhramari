import 'dart:convert';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path/path.dart' as path;
import 'package:sqflite_sqlcipher/sqflite.dart';
import 'package:uuid/uuid.dart';

import 'api.dart';
import 'canonical.dart';

class FieldVault {
  FieldVault(this.api);

  final ApiClient api;
  final _secure = const FlutterSecureStorage();
  final _signer = Ed25519();
  final _hash = Sha256();
  Database? _db;

  Future<void> open() async {
    var password = await _secure.read(key: 'vault.password');
    if (password == null) {
      password = base64UrlEncode(SecretKeyData.random(length: 32).bytes);
      await _secure.write(key: 'vault.password', value: password);
    }
    _db = await openDatabase(
      path.join(await getDatabasesPath(), 'bhramari-field.db'),
      password: password,
      version: 1,
      onCreate: (db, _) async {
        await db.execute(
          'CREATE TABLE queue (id TEXT PRIMARY KEY, envelope TEXT NOT NULL, created_at TEXT NOT NULL)',
        );
        await db.execute(
          'CREATE TABLE state (name TEXT PRIMARY KEY, value TEXT NOT NULL)',
        );
      },
    );
  }

  Future<int> pendingCount() async =>
      Sqflite.firstIntValue(
        await _database.rawQuery('SELECT COUNT(*) FROM queue'),
      ) ??
      0;

  Future<void> cache(String name, Object value) => _database.insert('state', {
    'name': 'cache.$name',
    'value': jsonEncode(value),
  }, conflictAlgorithm: ConflictAlgorithm.replace);

  Future<List<Map<String, dynamic>>> cachedList(String name) async {
    final value = await _state('cache.$name');
    return value == null
        ? []
        : (jsonDecode(value) as List).cast<Map<String, dynamic>>();
  }

  Future<void> registerDevice() async {
    if (await _secure.read(key: 'device.id') != null) return;
    final pair = await _signer.newKeyPair();
    final privateBytes = await pair.extractPrivateKeyBytes();
    final publicKey = await pair.extractPublicKey();
    final result = await api.post('/devices', {
      'name': 'Bhramari field phone',
      'public_key': base64Encode(publicKey.bytes),
    });
    await _secure.write(key: 'device.seed', value: base64Encode(privateBytes));
    await _secure.write(key: 'device.id', value: result['id'] as String);
  }

  Future<String> queueHarvest({
    required Map<String, dynamic> user,
    required String hiveId,
    required int quantityG,
    required String floral,
    String notes = '',
  }) async {
    final payload = {
      'hive_id': hiveId,
      'product': 'honey',
      'quantity_g': quantityG,
      'floral': floral,
      'notes': notes,
    };
    return _queue(
      user: user,
      eventType: 'harvest',
      subjectId: hiveId,
      payload: payload,
    );
  }

  Future<String> queueInspection({
    required Map<String, dynamic> user,
    required String hiveId,
    required String observation,
    required String status,
    bool? queenSeen,
    int? frames,
  }) => _queue(
    user: user,
    eventType: 'inspection',
    subjectId: hiveId,
    payload: {
      'observation': observation,
      'status': status,
      'queen_seen': queenSeen,
      'frames': frames,
    },
  );

  Future<String> _queue({
    required Map<String, dynamic> user,
    required String eventType,
    required String subjectId,
    required Map<String, dynamic> payload,
  }) async {
    final deviceId = await _secure.read(key: 'device.id');
    final seed = await _secure.read(key: 'device.seed');
    if (deviceId == null || seed == null) {
      throw StateError('Register this device while online first.');
    }
    final sequence = int.parse(await _state('sequence') ?? '0') + 1;
    final previousHash = await _state('last_hash') ?? '';
    final unsigned = <String, dynamic>{
      'schema_version': 1,
      'event_id': const Uuid().v7(),
      'actor_id': user['id'],
      'organisation_id': user['org_id'],
      'event_type': eventType,
      'subject_id': subjectId,
      'occurred_at': DateTime.now().toUtc().toIso8601String(),
      'device_sequence': sequence,
      'previous_event_hash': previousHash,
      'payload_hash': await _digest(payload),
      'attachment_hashes': <String>[],
      'key_id': deviceId,
      'capture_mode': 'OFFLINE',
      'payload': payload,
    };
    final pair = await _signer.newKeyPairFromSeed(base64Decode(seed));
    final signature = await _signer.sign(
      utf8.encode(canonicalJson(unsigned)),
      keyPair: pair,
    );
    final envelope = {...unsigned, 'signature': base64Encode(signature.bytes)};
    final envelopeHash = await _digest(unsigned);
    await _database.transaction((txn) async {
      await txn.insert('queue', {
        'id': unsigned['event_id'],
        'envelope': jsonEncode(envelope),
        'created_at': unsigned['occurred_at'],
      });
      await txn.insert('state', {
        'name': 'sequence',
        'value': '$sequence',
      }, conflictAlgorithm: ConflictAlgorithm.replace);
      await txn.insert('state', {
        'name': 'last_hash',
        'value': envelopeHash,
      }, conflictAlgorithm: ConflictAlgorithm.replace);
    });
    return unsigned['event_id'] as String;
  }

  Future<List<Map<String, dynamic>>> queued() async =>
      (await _database.query('queue', orderBy: 'created_at'))
          .map(
            (row) =>
                jsonDecode(row['envelope'] as String) as Map<String, dynamic>,
          )
          .toList();

  Future<List<Map<String, dynamic>>> sync() async {
    final events = await queued();
    if (events.isEmpty) return [];
    final result = await api.post('/sync', {'events': events});
    final receipts = (result['receipts'] as List).cast<Map<String, dynamic>>();
    final finalized = receipts
        .where(
          (item) =>
              item['status'] == 'accepted' || item['status'] == 'disputed',
        )
        .map((item) => item['event_id'])
        .toList();
    if (finalized.isNotEmpty) {
      await _database.delete(
        'queue',
        where: 'id IN (${List.filled(finalized.length, '?').join(',')})',
        whereArgs: finalized,
      );
    }
    return receipts;
  }

  Future<String?> _state(String name) async {
    final rows = await _database.query(
      'state',
      columns: ['value'],
      where: 'name = ?',
      whereArgs: [name],
      limit: 1,
    );
    return rows.isEmpty ? null : rows.first['value'] as String;
  }

  Future<String> _digest(Object value) async {
    final digest = await _hash.hash(utf8.encode(canonicalJson(value)));
    return digest.bytes
        .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
        .join();
  }

  Database get _database =>
      _db ?? (throw StateError('Vault has not been opened.'));
}
