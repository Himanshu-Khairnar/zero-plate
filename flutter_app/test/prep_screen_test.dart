import 'package:flutter/widgets.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:wasteless/screens/prep_screen.dart';

import 'helpers.dart';

void main() {
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({});
    SharedPreferences.setMockInitialValues({});
  });

  Map<String, Object?> plan(String status) => {'/prep-plan/full': {'plan': planViewJson(status: status)}};

  testWidgets('OWNER sees full plan, edit and Approve on a DRAFT', (tester) async {
    await pumpScreen(tester, const PrepScreen(), role: 'OWNER', routes: plan('DRAFT'));
    expect(requests, contains('GET /prep-plan/full'));
    expect(find.text('Dal Tadka'), findsWidgets);
    expect(find.text('Low 30 · Likely 38 · High 48'), findsOneWidget);
    expect(find.text('Toor dal'), findsOneWidget);
    expect(find.text('46 → 40'), findsOneWidget);
    expect(find.byKey(const ValueKey('edit-d1')), findsOneWidget);
    expect(find.text('Approve plan'), findsOneWidget);
    expect(find.text('Re-forecast'), findsOneWidget);
  });

  testWidgets('MANAGER sees Re-approve on an APPROVED plan', (tester) async {
    await pumpScreen(tester, const PrepScreen(), role: 'MANAGER', routes: plan('APPROVED'));
    expect(find.text('Re-approve'), findsOneWidget);
  });

  testWidgets('KITCHEN_STAFF: no edit, approve or re-forecast', (tester) async {
    await pumpScreen(tester, const PrepScreen(), role: 'KITCHEN_STAFF', routes: plan('DRAFT'));
    expect(find.text('Dal Tadka'), findsWidgets);
    expect(find.byKey(const ValueKey('edit-d1')), findsNothing);
    expect(find.text('Approve plan'), findsNothing);
    expect(find.text('Re-forecast'), findsNothing);
    expect(find.text('Waiting for an owner or manager to approve.'), findsOneWidget);
  });

  testWidgets('LOCKED plan is read-only even for OWNER', (tester) async {
    await pumpScreen(tester, const PrepScreen(), role: 'OWNER', routes: plan('LOCKED'));
    expect(find.text('LOCKED'), findsOneWidget);
    expect(find.text('Approve plan'), findsNothing);
    expect(find.byKey(const ValueKey('edit-d1')), findsNothing);
  });

  testWidgets('no plan: OWNER can generate a draft', (tester) async {
    await pumpScreen(tester, const PrepScreen(), role: 'OWNER', routes: {
      '/prep-plan/full': {'plan': null},
      'POST /prep-plan/generate': {'plan': planViewJson()},
    });
    expect(find.text('No plan for tomorrow yet'), findsOneWidget);
    await tester.tap(find.text('Generate draft'));
    await tester.pumpAndSettle();
    expect(requests, contains('POST /prep-plan/generate'));
    expect(find.text('Approve plan'), findsOneWidget);
  });

  testWidgets('no plan: KITCHEN_STAFF cannot generate', (tester) async {
    await pumpScreen(tester, const PrepScreen(), role: 'KITCHEN_STAFF', routes: {'/prep-plan/full': {'plan': null}});
    expect(find.text('No plan for tomorrow yet'), findsOneWidget);
    expect(find.text('Generate draft'), findsNothing);
  });

  testWidgets('OWNER adjusts a dish with a reason', (tester) async {
    final adjusted = planViewJson();
    (adjusted['items'] as List).first['plannedQty'] = 44;
    await pumpScreen(tester, const PrepScreen(), role: 'OWNER', routes: {
      ...plan('DRAFT'),
      'POST /prep-plan/p1/adjust': {'plan': adjusted},
    });
    await tester.tap(find.byKey(const ValueKey('edit-d1')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('adjust-qty')), '44');
    await tester.enterText(find.byKey(const Key('adjust-reason')), 'cricket match');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(requests, contains('POST /prep-plan/p1/adjust'));
    expect(find.text('44'), findsOneWidget);
  });
}
