import 'package:bhramari_field/src/vault.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('vault namespaces and finalized receipts are user-safe', () async {
    final first = await vaultNamespace('USER-A');
    final second = await vaultNamespace('USER-B');

    expect(first, isNot(second));
    expect(first, isNot(contains('USER-A')));
    expect(
      finalizedReceiptIds([
        {'event_id': 'accepted', 'status': 'accepted'},
        {'event_id': 'disputed', 'status': 'disputed'},
        {'event_id': 'rejected', 'status': 'rejected'},
      ]),
      ['accepted', 'disputed'],
    );
    expect(syncBatchSize, lessThanOrEqualTo(100));
  });
}
