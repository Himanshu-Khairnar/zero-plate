import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'models/models.dart';
import 'screens/alerts_screen.dart';
import 'screens/analytics_screen.dart';
import 'screens/heatmap_screen.dart';
import 'screens/inventory_screen.dart';
import 'screens/invite_screen.dart';
import 'screens/whatif_screen.dart';
import 'screens/assistant_screen.dart';
import 'screens/donations_screen.dart';
import 'screens/forecasts_screen.dart';
import 'screens/home_screen.dart';
import 'screens/kitchen_screen.dart';
import 'screens/login_screen.dart';
import 'screens/more_screen.dart';
import 'screens/prep_screen.dart';
import 'screens/waste_log_screen.dart';
import 'screens/waste_screen.dart';
import 'state/auth_provider.dart';

/// Bottom-navigation tabs, in order.
const _tabs = [
  (path: '/', label: 'Home', icon: Icons.dashboard_outlined, selected: Icons.dashboard),
  (path: '/prep', label: 'Prep', icon: Icons.assignment_outlined, selected: Icons.assignment),
  (path: '/kitchen', label: 'Kitchen', icon: Icons.restaurant_outlined, selected: Icons.restaurant),
  (path: '/waste', label: 'Waste', icon: Icons.delete_outline, selected: Icons.delete),
  (path: '/more', label: 'More', icon: Icons.menu, selected: Icons.menu_open),
];

GoRouter buildRouter(AuthProvider auth) {
  return GoRouter(
    initialLocation: '/',
    refreshListenable: auth,
    redirect: (context, state) {
      final loc = state.matchedLocation;
      switch (auth.status) {
        case AuthStatus.unknown:
          return loc == '/splash' ? null : '/splash';
        case AuthStatus.signedOut:
          return loc == '/login' ? null : '/login';
        case AuthStatus.signedIn:
          return (loc == '/login' || loc == '/splash') ? '/' : null;
      }
    },
    routes: [
      GoRoute(
        path: '/splash',
        builder: (context, state) => const Scaffold(body: Center(child: CircularProgressIndicator())),
      ),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      ShellRoute(
        builder: (context, state, child) => _TabShell(location: state.matchedLocation, child: child),
        routes: [
          GoRoute(path: '/', pageBuilder: (c, s) => const NoTransitionPage(child: HomeScreen())),
          GoRoute(path: '/prep', pageBuilder: (c, s) => const NoTransitionPage(child: PrepScreen())),
          GoRoute(path: '/kitchen', pageBuilder: (c, s) => const NoTransitionPage(child: KitchenScreen())),
          GoRoute(path: '/waste', pageBuilder: (c, s) => const NoTransitionPage(child: WasteScreen())),
          GoRoute(path: '/more', pageBuilder: (c, s) => const NoTransitionPage(child: MoreScreen())),
        ],
      ),
      // Full-screen pages pushed on top of the tabs.
      GoRoute(path: '/waste-log', builder: (c, s) => WasteLogScreen(prefill: s.extra as WastePrefill?)),
      GoRoute(path: '/alerts', builder: (c, s) => const AlertsScreen()),
      GoRoute(path: '/forecasts', builder: (c, s) => const ForecastsScreen()),
      GoRoute(path: '/donations', builder: (c, s) => const DonationsScreen()),
      GoRoute(path: '/assistant', builder: (c, s) => const AssistantScreen()),
      GoRoute(path: '/analytics', builder: (c, s) => const AnalyticsScreen()),
      GoRoute(path: '/waste-heatmap', builder: (c, s) => const HeatmapScreen()),
      GoRoute(path: '/inventory', builder: (c, s) => const InventoryScreen()),
      GoRoute(path: '/whatif', builder: (c, s) => const WhatIfScreen()),
      GoRoute(path: '/invite', builder: (c, s) => const InviteScreen()),
    ],
  );
}

class _TabShell extends StatelessWidget {
  const _TabShell({required this.location, required this.child});

  final String location;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final index = _tabs.indexWhere((t) => t.path == location);
    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: index < 0 ? 0 : index,
        onDestinationSelected: (i) => context.go(_tabs[i].path),
        destinations: [
          for (final t in _tabs)
            NavigationDestination(icon: Icon(t.icon), selectedIcon: Icon(t.selected), label: t.label),
        ],
      ),
    );
  }
}
