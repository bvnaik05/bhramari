import 'package:bhramari_field/src/canonical.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('canonical JSON sorts nested object keys without changing array order', () {
    expect(
      canonicalJson({'z': 1, 'a': {'d': true, 'b': [2, 1]}}),
      '{"a":{"b":[2,1],"d":true},"z":1}',
    );
  });
}
