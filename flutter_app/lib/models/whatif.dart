import 'json_utils.dart';

/// Scenario sent to POST whatif (Scenario in frontend/src/lib/ml.ts).
/// Null fields are left out so the model uses its own assumption.
class WhatIfScenario {
  final double? rainMm;
  final double? tempMax;
  final bool isHoliday;
  final double? discountPct;

  /// null = all dishes.
  final List<String>? dishIds;

  const WhatIfScenario({this.rainMm, this.tempMax, this.isHoliday = false, this.discountPct, this.dishIds});

  Map<String, dynamic> toJson() => {
        'rainMm': ?rainMm,
        'tempMax': ?tempMax,
        if (isHoliday) 'isHoliday': true,
        'discountPct': ?discountPct,
        'dishIds': ?dishIds,
      };
}

/// WhatIfLine in frontend/src/app/api/whatif/route.ts.
class WhatIfLine {
  final String dishId;
  final String dishName;
  final double low;
  final double likely;
  final double high;
  final double price;
  final double costPerPlate;
  final String explanation;
  final double riskWeight;
  final double prepQty;
  final double prepCost;
  final double expectedRevenue;
  final double wastePlates;
  final double wasteCost;
  final double lostSales;

  const WhatIfLine({
    required this.dishId,
    required this.dishName,
    required this.low,
    required this.likely,
    required this.high,
    this.price = 0,
    this.costPerPlate = 0,
    this.explanation = '',
    this.riskWeight = 0,
    required this.prepQty,
    required this.prepCost,
    this.expectedRevenue = 0,
    this.wastePlates = 0,
    required this.wasteCost,
    this.lostSales = 0,
  });

  factory WhatIfLine.fromJson(Map<String, dynamic> json) => WhatIfLine(
        dishId: json['dishId'] as String,
        dishName: json['dishName'] as String? ?? '',
        low: toDouble(json['low']),
        likely: toDouble(json['likely']),
        high: toDouble(json['high']),
        price: toDouble(json['price']),
        costPerPlate: toDouble(json['costPerPlate']),
        explanation: json['explanation'] as String? ?? '',
        riskWeight: toDouble(json['riskWeight']),
        prepQty: toDouble(json['prepQty']),
        prepCost: toDouble(json['prepCost']),
        expectedRevenue: toDouble(json['expectedRevenue']),
        wastePlates: toDouble(json['wastePlates']),
        wasteCost: toDouble(json['wasteCost']),
        lostSales: toDouble(json['lostSales']),
      );
}

/// WhatIfTotals in frontend/src/app/api/whatif/route.ts.
class WhatIfTotals {
  final double likely;
  final double prepQty;
  final double prepCost;
  final double expectedRevenue;
  final double wastePlates;
  final double wasteCost;
  final double lostSales;

  const WhatIfTotals({
    required this.likely,
    required this.prepQty,
    required this.prepCost,
    required this.expectedRevenue,
    required this.wastePlates,
    required this.wasteCost,
    required this.lostSales,
  });

  factory WhatIfTotals.fromJson(Map<String, dynamic>? json) => WhatIfTotals(
        likely: toDouble(json?['likely']),
        prepQty: toDouble(json?['prepQty']),
        prepCost: toDouble(json?['prepCost']),
        expectedRevenue: toDouble(json?['expectedRevenue']),
        wastePlates: toDouble(json?['wastePlates']),
        wasteCost: toDouble(json?['wasteCost']),
        lostSales: toDouble(json?['lostSales']),
      );
}

class WhatIfSide {
  final List<WhatIfLine> rows;
  final WhatIfTotals totals;

  const WhatIfSide({required this.rows, required this.totals});

  factory WhatIfSide.fromJson(Map<String, dynamic>? json) => WhatIfSide(
        rows: (json?['rows'] as List? ?? [])
            .map((e) => WhatIfLine.fromJson(e as Map<String, dynamic>))
            .toList(),
        totals: WhatIfTotals.fromJson(json?['totals'] as Map<String, dynamic>?),
      );
}

class WhatIfAssumed {
  final double? rainMm;
  final double? tempMax;
  final bool isHoliday;
  final String? holidayName;
  final bool isWeekend;

  const WhatIfAssumed({this.rainMm, this.tempMax, this.isHoliday = false, this.holidayName, this.isWeekend = false});

  factory WhatIfAssumed.fromJson(Map<String, dynamic>? json) => WhatIfAssumed(
        rainMm: toDoubleOrNull(json?['rainMm']),
        tempMax: toDoubleOrNull(json?['tempMax']),
        isHoliday: json?['isHoliday'] as bool? ?? false,
        holidayName: json?['holidayName'] as String?,
        isWeekend: json?['isWeekend'] as bool? ?? false,
      );
}

/// Response of POST whatif.
class WhatIfResult {
  final String date;
  final String modelVersion;
  final WhatIfAssumed assumed;
  final WhatIfSide baseline;
  final WhatIfSide scenario;

  const WhatIfResult({
    required this.date,
    required this.modelVersion,
    required this.assumed,
    required this.baseline,
    required this.scenario,
  });

  factory WhatIfResult.fromJson(Map<String, dynamic> json) => WhatIfResult(
        date: json['date'] as String? ?? '',
        modelVersion: json['modelVersion'] as String? ?? '',
        assumed: WhatIfAssumed.fromJson(json['assumed'] as Map<String, dynamic>?),
        baseline: WhatIfSide.fromJson(json['baseline'] as Map<String, dynamic>?),
        // `scenario` in the response echoes the request; the result is `scenario_result`.
        scenario: WhatIfSide.fromJson(json['scenario_result'] as Map<String, dynamic>?),
      );
}
