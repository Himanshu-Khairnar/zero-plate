import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:wasteless/screens/alerts_screen.dart';
import 'package:wasteless/screens/invite_screen.dart';
import 'package:wasteless/screens/kitchen_screen.dart';
import 'package:wasteless/screens/more_screen.dart';
import 'package:wasteless/screens/waste_screen.dart';

import 'helpers.dart';

const _kitchen = {
  '/kitchen': {
    'date': '2026-10-26',
    'locked': false,
    'dishes': [
      {
        'dishId': 'd1',
        'dishName': 'Dal',
        'target': 30,
        'prepared': 30,
        'sold': 25,
        'leftover': 5,
        'shifts': {
          'LUNCH': {'prepared': 30, 'sold': 25},
        },
      },
    ],
  },
};

const _waste = {
  '/waste': {
    'items': [
      {'id': 'w1', 'date': '2026-10-26', 'dishName': 'Dal', 'ingredientName': null, 'qty': 2, 'unit': 'plates', 'reason': 'overproduction', 'value': 80},
    ],
  },
};

const _alerts = {
  '/alerts': {
    'items': [
      {'id': 'a1', 'type': 'LOW_STOCK', 'severity': 'warning', 'title': 'Low stock', 'message': 'Onion low', 'createdAt': '2026-10-26T08:00:00Z', 'read': false},
    ],
  },
};

void main() {
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({});
  });

  group('Kitchen', () {
    testWidgets('OWNER sees leftovers and lock', (tester) async {
      await pumpScreen(tester, const KitchenScreen(), role: 'OWNER', routes: _kitchen);
      expect(find.text('Log leftovers as waste'), findsOneWidget);
      expect(find.text('Close & lock day'), findsOneWidget);
    });

    testWidgets('KITCHEN_STAFF sees leftovers but not lock', (tester) async {
      await pumpScreen(tester, const KitchenScreen(), role: 'KITCHEN_STAFF', routes: _kitchen);
      expect(find.text('Log leftovers as waste'), findsOneWidget);
      expect(find.text('Close & lock day'), findsNothing);
    });

    testWidgets('lock asks for confirmation then posts', (tester) async {
      await pumpScreen(tester, const KitchenScreen(), role: 'MANAGER', routes: {
        ..._kitchen,
        'POST /kitchen/lock': {'ok': true},
      });
      await tester.tap(find.text('Close & lock day'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Prepared 30 · sold 25 · leftover 5'), findsOneWidget);
      await tester.tap(find.text('Lock day'));
      await tester.pumpAndSettle();
      expect(requests, contains('POST /kitchen/lock'));
    });
  });

  group('Waste', () {
    testWidgets('OWNER can swipe to delete', (tester) async {
      await pumpScreen(tester, const WasteScreen(), role: 'OWNER', routes: _waste);
      expect(find.byType(Dismissible), findsOneWidget);
      expect(find.byTooltip('Recognise from photo'), findsOneWidget);
    });

    testWidgets('KITCHEN_STAFF cannot delete but can use the camera', (tester) async {
      await pumpScreen(tester, const WasteScreen(), role: 'KITCHEN_STAFF', routes: _waste);
      expect(find.text('Dal'), findsOneWidget);
      expect(find.byType(Dismissible), findsNothing);
      expect(find.byTooltip('Recognise from photo'), findsOneWidget);
    });

    testWidgets('long-press delete confirms and calls DELETE', (tester) async {
      await pumpScreen(tester, const WasteScreen(), role: 'MANAGER', routes: {
        ..._waste,
        'DELETE /waste/w1': {'ok': true},
      });
      await tester.longPress(find.text('Dal'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete'));
      await tester.pumpAndSettle();
      expect(requests, contains('DELETE /waste/w1'));
    });
  });

  group('Alerts', () {
    testWidgets('OWNER sees scan and mark all read', (tester) async {
      await pumpScreen(tester, const AlertsScreen(), role: 'OWNER', routes: {
        ..._alerts,
        'POST /alerts/scan': {'ok': true, 'created': 2},
      });
      expect(find.byTooltip('Mark all read'), findsOneWidget);
      await tester.tap(find.byTooltip('Run anomaly scan'));
      await tester.pumpAndSettle();
      expect(find.text('Scan finished: 2 new alerts'), findsOneWidget);
    });

    testWidgets('KITCHEN_STAFF: mark all read only', (tester) async {
      await pumpScreen(tester, const AlertsScreen(), role: 'KITCHEN_STAFF', routes: _alerts);
      expect(find.byTooltip('Mark all read'), findsOneWidget);
      expect(find.byTooltip('Run anomaly scan'), findsNothing);
    });
  });

  group('Invite', () {
    testWidgets('More shows Invite staff only to OWNER/MANAGER', (tester) async {
      await pumpScreen(tester, const MoreScreen(), role: 'MANAGER');
      expect(find.text('Invite staff'), findsOneWidget);
      expect(find.text('Analytics'), findsOneWidget);
      await pumpScreen(tester, const MoreScreen(), role: 'KITCHEN_STAFF');
      expect(find.text('Invite staff'), findsNothing);
      expect(find.text('Analytics'), findsOneWidget);
    });

    testWidgets('KITCHEN_STAFF opening the invite screen sees no form', (tester) async {
      await pumpScreen(tester, const InviteScreen(), role: 'KITCHEN_STAFF');
      expect(find.text('Send invitation'), findsNothing);
    });

    testWidgets('OWNER invites and gets a link', (tester) async {
      await pumpScreen(tester, const InviteScreen(), role: 'OWNER', routes: {
        'POST /staff/invite': {'ok': true, 'inviteUrl': 'https://x.test/invite/abc'},
      });
      await tester.enterText(find.byKey(const Key('invite-email')), 'cook@x.com');
      await tester.tap(find.text('Send invitation'));
      await tester.pumpAndSettle();
      expect(find.text('https://x.test/invite/abc'), findsOneWidget);
      expect(find.byTooltip('Copy link'), findsOneWidget);
    });
  });
}
