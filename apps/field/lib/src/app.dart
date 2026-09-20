import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api.dart';
import 'mobile_workspace.dart';
import 'vault.dart';

const honey = Color(0xffffb000);
const ink = Color(0xff241500);

class BhramariApp extends StatelessWidget {
  const BhramariApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Bhramari Field',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(
        seedColor: honey,
        brightness: Brightness.light,
      ),
      scaffoldBackgroundColor: const Color(0xfffffbf2),
      cardTheme: const CardThemeData(
        elevation: 0,
        color: Colors.white,
        margin: EdgeInsets.zero,
      ),
      inputDecorationTheme: const InputDecorationTheme(
        border: OutlineInputBorder(),
      ),
      useMaterial3: true,
    ),
    home: const FieldApp(),
  );
}

class FieldApp extends StatefulWidget {
  const FieldApp({super.key});

  @override
  State<FieldApp> createState() => _FieldAppState();
}

class _FieldAppState extends State<FieldApp> {
  final api = ApiClient();
  final secure = const FlutterSecureStorage();
  late final FieldVault vault = FieldVault(api);
  Map<String, dynamic>? user;
  List<Map<String, dynamic>> hives = [];
  List<Map<String, dynamic>> lots = [];
  List<Map<String, dynamic>> requirements = [];
  List<Map<String, dynamic>> languages = [];
  int pending = 0;
  bool busy = true;
  String? error;

  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    await vault.open();
    final token = await secure.read(key: 'session.token');
    final saved = await secure.read(key: 'session.user');
    if (token != null && saved != null) {
      api.token = token;
      user = jsonDecode(saved) as Map<String, dynamic>;
      await _refresh();
    }
    pending = await vault.pendingCount();
    if (mounted) setState(() => busy = false);
  }

  Future<void> _login(String email, String password) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final session = await api.login(email, password);
      user = session['user'] as Map<String, dynamic>;
      await secure.write(key: 'session.token', value: api.token);
      await secure.write(key: 'session.user', value: jsonEncode(user));
      await vault.registerDevice();
      await _refresh();
    } catch (failure) {
      error = failure.toString();
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _refresh() async {
    try {
      hives = await api.list('/hives');
      lots = await api.list('/lots');
      requirements = await api.list('/market/requirements');
      final manifest = await api.get('/languages') as Map<String, dynamic>;
      languages = (manifest['languages'] as List).cast<Map<String, dynamic>>();
      await Future.wait([
        vault.cache('hives', hives),
        vault.cache('lots', lots),
        vault.cache('requirements', requirements),
        vault.cache('languages', languages),
      ]);
    } catch (failure) {
      hives = await vault.cachedList('hives');
      lots = await vault.cachedList('lots');
      requirements = await vault.cachedList('requirements');
      languages = await vault.cachedList('languages');
      error = 'Offline mode · showing records already on this device';
    }
    pending = await vault.pendingCount();
    if (mounted) setState(() {});
  }

  Future<void> _sync() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final receipts = await vault.sync();
      error = receipts.isEmpty
          ? 'Nothing is waiting to sync.'
          : '${receipts.length} signed record(s) reconciled.';
    } catch (failure) {
      error =
          'Still offline. Your signed records remain encrypted on this device.';
    } finally {
      pending = await vault.pendingCount();
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _logout() async {
    await secure.delete(key: 'session.token');
    await secure.delete(key: 'session.user');
    api.token = null;
    setState(() {
      user = null;
      hives = [];
    });
  }

  @override
  Widget build(BuildContext context) {
    if (busy && user == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (user == null) {
      return LoginScreen(onLogin: _login, busy: busy, error: error);
    }
    return MobileWorkspace(
      api: api,
      vault: vault,
      user: user!,
      hives: hives,
      lots: lots,
      requirements: requirements,
      languages: languages,
      pending: pending,
      busy: busy,
      message: error,
      onRefresh: _refresh,
      onSync: _sync,
      onLogout: _logout,
      onQueueChanged: () async {
        pending = await vault.pendingCount();
        setState(
          () =>
              error = 'Record signed and saved in the encrypted offline vault.',
        );
      },
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({
    super.key,
    required this.onLogin,
    required this.busy,
    this.error,
  });
  final Future<void> Function(String, String) onLogin;
  final bool busy;
  final String? error;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final email = TextEditingController(text: 'beekeeper@bhramari.local');
  final password = TextEditingController(text: 'demo-honey-2026');

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const _Brand(),
                const SizedBox(height: 38),
                const Text(
                  'Field records that travel with the honey.',
                  style: TextStyle(
                    fontSize: 34,
                    fontWeight: FontWeight.w800,
                    height: 1.05,
                    color: ink,
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Sign harvests on this phone, keep working without a signal, and reconcile safely when connectivity returns.',
                ),
                const SizedBox(height: 28),
                TextField(
                  controller: email,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(labelText: 'Email'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: password,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Password'),
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: widget.busy
                      ? null
                      : () => widget.onLogin(email.text.trim(), password.text),
                  child: Text(
                    widget.busy ? 'Opening…' : 'Open field workspace',
                  ),
                ),
                if (widget.error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 14),
                    child: Text(
                      widget.error!,
                      style: const TextStyle(color: Colors.red),
                    ),
                  ),
                const SizedBox(height: 16),
                const Text(
                  'This build uses the explicit simulated demo account. Production sign-in uses the configured identity provider.',
                  style: TextStyle(fontSize: 12, color: Colors.black54),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

class _Brand extends StatelessWidget {
  const _Brand();
  @override
  Widget build(BuildContext context) => const Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(Icons.hive_outlined, color: Color(0xffa76b00)),
      SizedBox(width: 8),
      Text(
        'BHRAMARI',
        style: TextStyle(
          fontWeight: FontWeight.w900,
          letterSpacing: 2,
          color: ink,
        ),
      ),
    ],
  );
}
