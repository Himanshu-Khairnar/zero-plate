import 'package:flutter_test/flutter_test.dart';
import 'package:wasteless/api/api_client.dart';
import 'package:wasteless/models/models.dart';

import 'helpers.dart';

void main() {
  group('PlanView', () {
    test('parses items, ingredients, totals and adjustments', () {
      final p = planFromResponse({'plan': planViewJson(status: 'APPROVED')})!;
      expect(p.isApproved, isTrue);
      expect(p.isLocked, isFalse);
      expect(p.approvedBy, 'Asha Owner');
      expect(p.modelVersion, 'lgbm-v3');
      final i = p.items.single;
      expect(i.forecastLow, 30.4);
      expect(i.suggestedQty, 46);
      expect(i.plannedQty, 40);
      expect(i.riskLabel, 'lean high');
      expect(i.recipe.single.qtyPerPlate, 0.08);
      expect(p.ingredients.single.dishNames, ['Dal Tadka']);
      expect(p.totals.plates, 40);
      expect(p.totals.prepCost, 1700.0);
      expect(p.adjustments.single.fromQty, 46);
      expect(p.adjustments.single.reason, 'Fewer bookings');
    });

    test('null plan and missing optional fields', () {
      expect(planFromResponse({'plan': null}), isNull);
      final p = PlanView.fromJson({
        'id': 'p',
        'date': '2026-10-26',
        'status': 'LOCKED',
        'items': [
          {
            'id': 'i',
            'dishId': 'd',
            'dishName': 'Rice',
            'forecastLow': 1,
            'forecastLikely': 2,
            'forecastHigh': 3,
            'riskWeight': 0.3,
            'suggestedQty': 2,
            'plannedQty': 2,
            'explanation': null,
          },
        ],
      });
      expect(p.isLocked, isTrue);
      expect(p.items.single.explanation, isNull);
      expect(p.items.single.riskLabel, 'lean likely');
      expect(p.ingredients, isEmpty);
      expect(p.totals.plates, 0);
    });
  });

  test('InventoryResponse: StockRow and SuggestedOrder', () {
    final r = InventoryResponse.fromJson({
      'rows': [
        {
          'ingredientId': 'g1',
          'name': 'Onion',
          'unit': 'kg',
          'costPerUnit': 30,
          'shelfLifeDays': 14,
          'onHand': 2.5,
          'dailyUsage': 4,
          'daysOfCover': 0.6,
          'leadTimeDays': 2,
          'reorderPoint': 12,
          'needLead': 12,
          'status': 'LOW',
          'nextExpiry': '2026-10-27',
          'expiryState': 'soon',
          'batches': [
            {'date': '2026-10-20', 'expiryDate': '2026-10-27', 'remaining': 2.5},
          ],
          'cheapestSupplier': {'id': 's1', 'name': 'Fresh Farms', 'price': 28, 'leadTimeDays': 1},
        },
        {
          'ingredientId': 'g2',
          'name': 'Paneer',
          'unit': 'kg',
          'costPerUnit': 320,
          'shelfLifeDays': 3,
          'onHand': 0,
          'dailyUsage': 0,
          'daysOfCover': null,
          'leadTimeDays': 2,
          'reorderPoint': 0,
          'needLead': 0,
          'status': 'OUT',
          'nextExpiry': null,
          'expiryState': null,
          'batches': [],
          'cheapestSupplier': null,
        },
      ],
      'suggestedOrders': [
        {
          'supplierId': 's1',
          'supplierName': 'Fresh Farms',
          'leadTimeDays': 1,
          'expectedDate': '2026-10-27',
          'items': [
            {'ingredientId': 'g1', 'name': 'Onion', 'unit': 'kg', 'qty': 10, 'unitPrice': 28, 'onHand': 2.5, 'need': 12},
          ],
        },
        {'supplierId': null, 'supplierName': null, 'leadTimeDays': 2, 'expectedDate': '2026-10-28', 'items': []},
      ],
    });
    expect(r.rows.first.status, 'LOW');
    expect(r.rows.first.batches.single.remaining, 2.5);
    expect(r.rows.first.cheapestSupplier!.name, 'Fresh Farms');
    expect(r.rows.last.daysOfCover, isNull);
    expect(r.rows.last.expiryState, isNull);
    expect(r.suggestedOrders.first.total, 280);
    expect(r.suggestedOrders.last.supplierName, isNull);
  });

  test('SurplusEstimate and NGOs', () {
    final s = SurplusEstimate.fromJson({
      'date': '2026-10-26',
      'total': 12,
      'lines': [
        {'dishId': 'd1', 'dishName': 'Veg Biryani', 'plates': 8, 'source': 'plan'},
        {'dishId': 'd2', 'dishName': 'Dal', 'plates': 4, 'source': 'kitchen'},
      ],
    });
    expect(s.total, 12);
    expect(s.lines.last.source, 'kitchen');

    final n = ngosFromResponse({
      'items': [
        {'id': 'n1', 'name': 'Roti Bank', 'city': 'Mumbai', 'contact': null, 'acceptsCooked': true},
      ],
    });
    expect(n.single.name, 'Roti Bank');
    expect(n.single.contact, isNull);
  });

  test('VisionResult and WastePrefill', () {
    final v = VisionResult.fromJson({
      'items': [
        {'label': 'biryani', 'dishName': 'Veg Biryani', 'dishId': 'd1', 'estimatedQty': 3.5, 'confidence': 0.82},
        {'label': 'unknown curry', 'dishName': null, 'dishId': null, 'estimatedQty': 1, 'confidence': 0.4},
      ],
      'model': 'opencv-hsv-v1',
      'note': 'Estimates from tray area',
    });
    expect(v.items.first.displayName, 'Veg Biryani');
    expect(v.items.last.displayName, 'unknown curry');
    final p = WastePrefill.fromSuggestion(v.items.first);
    expect(p.dishId, 'd1');
    expect(p.qty, 3.5);
    expect(p.note, contains('82%'));
  });

  group('AnalyticsResponse', () {
    Map<String, dynamic> body(Object accuracy) => {
          'sales': [
            {'date': '2026-10-24', 'plates': 120, 'revenue': 21000},
          ],
          'accuracy': accuracy,
          'waste': {
            'byReason': [
              {'reason': 'overproduction', 'plates': 20, 'cost': 900},
            ],
            'totalPlates': 20,
            'totalCost': 900,
          },
          'savings': {'moneySaved': 4200, 'baselineShare': 6.1, 'currentShare': 3.4, 'note': 'Waste share of revenue'},
          'explanations': [
            {'dish': 'Dal', 'likely': 38, 'explanation': 'Weekend uplift'},
          ],
        };

    test('accuracy as AccuracyPoint[] (doc)', () {
      final a = AnalyticsResponse.fromJson(body([
        {'date': '2026-10-24', 'actual': 110, 'likely': 118, 'low': 95, 'high': 140},
      ]));
      expect(a.sales.single.revenue, 21000);
      expect(a.accuracy.single.high, 140);
      expect(a.waste.byReason.single.reason, 'overproduction');
      expect(a.waste.totalCost, 900);
      expect(a.savings.currentShare, 3.4);
      expect(a.explanations.single.likely, 38);
    });

    test('accuracy as forecastAccuracy() object, savings without shares', () {
      final json = body({
        'n': 3,
        'mape': 12.5,
        'series': [
          {'date': '2026-10-24', 'actual': 1, 'likely': 2, 'low': 1, 'high': 3},
        ],
      });
      json['savings'] = {'moneySaved': 0, 'baselineShare': null, 'currentShare': null, 'note': 'No waste history yet.'};
      final a = AnalyticsResponse.fromJson(json);
      expect(a.accuracy.single.likely, 2);
      expect(a.savings.baselineShare, isNull);
    });
  });

  test('HeatmapResponse', () {
    final h = HeatmapResponse.fromJson({
      'cells': [
        {'dishId': 'd1', 'dishName': 'Dal', 'weekday': 6, 'plates': 9, 'cost': 380},
      ],
    });
    expect(h.cells.single.weekday, 6);
    expect(h.cells.single.cost, 380);
  });

  test('WhatIfResult and scenario JSON', () {
    Map<String, dynamic> line(double likely, double prep) => {
          'dishId': 'd1',
          'dishName': 'Dal',
          'low': likely - 5,
          'likely': likely,
          'high': likely + 5,
          'price': 180,
          'costPerPlate': 40,
          'explanation': 'Rain lowers walk-ins',
          'riskWeight': 0.5,
          'prepQty': prep,
          'prepCost': prep * 40,
          'expectedRevenue': likely * 180,
          'wastePlates': 2,
          'wasteCost': 80,
          'lostSales': 0,
        };
    Map<String, dynamic> totals(double likely) => {
          'likely': likely,
          'prepQty': likely + 3,
          'prepCost': 1000,
          'expectedRevenue': 5000,
          'wastePlates': 2,
          'wasteCost': 80,
          'lostSales': 0,
        };
    final r = WhatIfResult.fromJson({
      'date': '2026-10-27',
      'modelVersion': 'lgbm-v3',
      'assumed': {'rainMm': null, 'tempMax': 31.5, 'isHoliday': false, 'holidayName': null, 'isWeekend': false},
      'scenario': {'rainMm': 40},
      'baseline': {'rows': [line(40, 44)], 'totals': totals(40)},
      'scenario_result': {'rows': [line(32, 36)], 'totals': totals(32)},
    });
    expect(r.assumed.rainMm, isNull);
    expect(r.assumed.tempMax, 31.5);
    expect(r.baseline.rows.single.likely, 40);
    expect(r.scenario.rows.single.prepQty, 36);
    expect(r.scenario.totals.likely, 32);

    expect(const WhatIfScenario().toJson(), isEmpty);
    expect(
      const WhatIfScenario(rainMm: 25, isHoliday: true, dishIds: ['d1']).toJson(),
      {'rainMm': 25.0, 'isHoliday': true, 'dishIds': ['d1']},
    );
  });

  test('image MIME type for uploads', () {
    expect(imageMimeType('IMG_1.JPG'), 'image/jpeg');
    expect(imageMimeType('a.png'), 'image/png');
    expect(imageMimeType('a.webp'), 'image/webp');
    expect(imageMimeType('a.heic'), 'image/heic');
  });
}
