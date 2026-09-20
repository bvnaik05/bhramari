# Bhramari Field

Flutter application for signed, offline-first field capture. The local SQLCipher
database password and Ed25519 device key are stored with Android Keystore or
iOS Keychain through `flutter_secure_storage`.

```powershell
flutter run --dart-define API_URL=http://10.0.2.2:8000/api/v1
```

`10.0.2.2` is permitted as cleartext traffic for the Android emulator only.
Use an HTTPS API URL for deployed builds. Sign in once while connected to
register the device key. Harvests can then be signed and queued without a
network connection.
