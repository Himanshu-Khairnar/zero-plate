import 'package:flutter_test/flutter_test.dart';
import 'package:wasteless/models/models.dart';

void main() {
  group('LoginResponse', () {
    test('parses token, user and outlets', () {
      final r = LoginResponse.fromJson({
        'token': 'abc',
        'user': {
          'id': 'u1',
          'name': 'Asha Owner',
          'email': 'owner@wasteless.local',
          'role': 'OWNER',
          'organizationName': 'Spice Route',
        },
        'outlets': [
          {'id': 'o1', 'name': 'Andheri'},
          {'id': 'o2', 'name': 'Bandra'},
        ],
      });
      expect(r.token, 'abc');
      expect(r.user.role, Role.owner);
      expect(r.user.canApprove, isTrue);
      expect(r.outlets.map((o) => o.name), ['Andheri', 'Bandra']);
    });

    test('platform admin has null organization, staff cannot approve', () {
      final admin = User.fromJson({'id': 'a', 'name': 'A', 'email': 'a@x', 'role': 'PLATFORM_ADMIN', 'organizationName': null});
      final staff = User.fromJson({'id': 's', 'name': 'S', 'email': 's@x', 'role': 'KITCHEN_STAFF', 'organizationName': 'Org'});
      expect(admin.organizationName, isNull);
      expect(staff.canApprove, isFalse);
    });
  });

  test('Dashboard keeps accuracyPct null and parses the 14-day trend', () {
    final d = Dashboard.fromJson({
      'date': '2026-10-24',
      'kpis': {
        'forecastCovers': 120,
        'wasteKg': 12.5,
        'wasteValue': 3400,
        'revenue': 250000,
        'accuracyPct': null,
        'mealsDonated': 40,
      },
      'alertsOpen': 3,
      'prepStatus': 'DRAFT',
      'wasteTrend': [
        for (var i = 0; i < 14; i++) {'date': '2026-10-${(11 + i).toString().padLeft(2, '0')}', 'wasteKg': i * 0.5},
      ],
    });
    expect(d.kpis.accuracyPct, isNull);
    expect(d.kpis.forecastCovers, 120.0);
    expect(d.wasteTrend, hasLength(14));
    expect(d.wasteTrend.last.wasteKg, 6.5);
    expect(d.prepStatus, 'DRAFT');
  });

  group('PrepPlanResponse', () {
    test('null plan', () {
      expect(PrepPlanResponse.fromJson({'plan': null}).plan, isNull);
    });

    test('LOCKED counts as approved', () {
      final r = PrepPlanResponse.fromJson({
        'plan': {
          'id': 'p1',
          'date': '2026-10-25',
          'status': 'LOCKED',
          'items': [
            {'id': 'i1', 'dishId': 'd1', 'dishName': 'Dal', 'forecastQty': 40, 'plannedQty': 38, 'unit': 'plates'},
          ],
        },
      });
      expect(r.plan!.isApproved, isTrue);
      expect(r.plan!.isDraft, isFalse);
      expect(r.plan!.items.single.plannedQty, 38);
    });
  });

  test('KitchenResponse parses per-shift counts, missing shift is zero', () {
    final k = KitchenResponse.fromJson({
      'date': '2026-10-24',
      'locked': false,
      'dishes': [
        {
          'dishId': 'd1',
          'dishName': 'Paneer Tikka',
          'target': 30,
          'prepared': 25,
          'sold': 20,
          'leftover': 5,
          'shifts': {
            'LUNCH': {'prepared': 15, 'sold': 12},
          },
        },
      ],
    });
    final dish = k.dishes.single;
    expect(dish.countsFor(Shift.lunch), const ShiftCounts(prepared: 15, sold: 12));
    expect(dish.countsFor(Shift.dinner), ShiftCounts.zero);
    expect(Shift.dinner.apiValue, 'DINNER');
  });

  test('Waste items and options', () {
    final w = WasteResponse.fromJson({
      'items': [
        {'id': 'w1', 'date': '2026-10-24', 'dishName': null, 'ingredientName': 'Tomato', 'qty': 1.5, 'unit': 'kg', 'reason': 'spoilage', 'value': 60},
      ],
    });
    expect(w.items.single.name, 'Tomato');
    expect(reasonLabel('plate_waste'), 'Plate waste');

    final o = WasteOptions.fromJson({
      'dishes': [
        {'id': 'd1', 'name': 'Dal'},
      ],
      'ingredients': [
        {'id': 'i1', 'name': 'Tomato', 'unit': 'kg'},
      ],
      'reasons': ['overproduction', 'spoilage', 'plate_waste', 'prep_loss'],
    });
    expect(o.ingredients.single.unit, 'kg');
    expect(o.dishes.single.unit, isNull);
    expect(o.reasons, hasLength(4));
  });

  test('Forecasts, alerts and donations', () {
    final f = ForecastsResponse.fromJson({
      'days': [
        {
          'date': '2026-10-24',
          'items': [
            {'dishId': 'd1', 'dishName': 'Dal', 'low': 10, 'likely': 14, 'high': 18},
            {'dishId': 'd2', 'dishName': 'Rice', 'low': 5, 'likely': 6, 'high': 9},
          ],
        },
        {'date': '2026-10-25', 'items': []},
      ],
    });
    expect(f.days.first.totalLikely, 20);
    expect(f.days.last.items, isEmpty);

    final a = AlertsResponse.fromJson({
      'items': [
        {'id': 'a1', 'type': 'LOW_STOCK', 'severity': 'warning', 'title': 'Low stock', 'message': 'Onions low', 'createdAt': '2026-10-24T08:00:00Z', 'read': false},
      ],
    });
    expect(a.items.single.severity, 'warning');

    final d = DonationsResponse.fromJson({
      'mealsDonated': 120,
      'items': [
        {'id': 'n1', 'date': '2026-10-20', 'ngoName': null, 'meals': 30, 'status': 'PLANNED'},
      ],
    });
    expect(d.mealsDonated, 120);
    expect(d.items.single.ngoName, isNull);
  });
}
