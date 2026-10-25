import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/api_client.dart';
import '../models/models.dart';

enum AuthStatus { unknown, signedOut, signedIn }

/// Holds the signed-in user and the JWT. The token is kept in
/// flutter_secure_storage (Keychain / Keystore; localStorage on web).
class AuthProvider extends ChangeNotifier {
  AuthProvider(this.api, {FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage() {
    api.onUnauthorized = () => logout();
  }

  static const _tokenKey = 'wasteless_token';

  final ApiClient api;
  final FlutterSecureStorage _storage;

  AuthStatus status = AuthStatus.unknown;
  User? user;
  List<Outlet> outlets = const [];

  bool get isSignedIn => status == AuthStatus.signedIn;

  /// Restores a saved session on app start.
  Future<void> bootstrap() async {
    String? token;
    try {
      token = await _storage.read(key: _tokenKey);
    } catch (_) {
      token = null;
    }
    if (token == null) {
      _setSignedOut();
      return;
    }
    api.token = token;
    try {
      final me = await api.me();
      user = me.user;
      outlets = me.outlets;
      status = AuthStatus.signedIn;
      notifyListeners();
    } on ApiException catch (e) {
      if (e.status == 401) {
        await logout();
      } else {
        // Offline or server down: keep the token, let screens show the error.
        status = AuthStatus.signedOut;
        api.token = null;
        notifyListeners();
      }
    }
  }

  Future<void> login(String email, String password) async {
    final res = await api.login(email.trim(), password);
    api.token = res.token;
    user = res.user;
    outlets = res.outlets;
    try {
      await _storage.write(key: _tokenKey, value: res.token);
    } catch (_) {
      // Storage unavailable: session still works until the app closes.
    }
    status = AuthStatus.signedIn;
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await _storage.delete(key: _tokenKey);
    } catch (_) {}
    _setSignedOut();
  }

  void _setSignedOut() {
    api.token = null;
    user = null;
    outlets = const [];
    status = AuthStatus.signedOut;
    notifyListeners();
  }
}
