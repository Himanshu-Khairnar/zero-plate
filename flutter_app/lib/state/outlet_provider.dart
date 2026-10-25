import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/models.dart';

/// The outlet the user is currently looking at. Every outlet-scoped screen
/// reads [outletId]; the choice is remembered with shared_preferences.
class OutletProvider extends ChangeNotifier {
  static const _key = 'wasteless_outlet';

  List<Outlet> _outlets = const [];
  String? _selectedId;

  List<Outlet> get outlets => _outlets;

  Outlet? get outlet {
    if (_outlets.isEmpty) return null;
    return _outlets.firstWhere((o) => o.id == _selectedId, orElse: () => _outlets.first);
  }

  String? get outletId => outlet?.id;

  /// Called by the ChangeNotifierProxyProvider whenever auth changes.
  void updateOutlets(List<Outlet> outlets) {
    if (identical(outlets, _outlets)) return;
    _outlets = outlets;
    if (outlets.isEmpty) return;
    if (_selectedId == null || !outlets.any((o) => o.id == _selectedId)) {
      _restore();
    }
  }

  Future<void> _restore() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_key);
      if (saved != null && _outlets.any((o) => o.id == saved) && saved != _selectedId) {
        _selectedId = saved;
        notifyListeners();
      }
    } catch (_) {}
  }

  Future<void> select(String id) async {
    if (id == _selectedId) return;
    _selectedId = id;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_key, id);
    } catch (_) {}
  }
}
