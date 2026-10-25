import 'json_utils.dart';

/// DayPoint in frontend/src/lib/analytics.ts.
class DayPoint {
  final String date;
  final double plates;
  final double revenue;

  const DayPoint({required this.date, required this.plates, required this.revenue});

  factory DayPoint.fromJson(Map<String, dynamic> json) => DayPoint(
        date: json['date'] as String,
        plates: toDouble(json['plates']),
        revenue: toDouble(json['revenue']),
      );
}

/// AccuracyPoint: forecast (low/likely/high band) vs actual plates for a past day.
class AccuracyPoint {
  final String date;
  final double actual;
  final double likely;
  final double low;
  final double high;

  const AccuracyPoint({
    required this.date,
    required this.actual,
    required this.likely,
    required this.low,
    required this.high,
  });

  factory AccuracyPoint.fromJson(Map<String, dynamic> json) => AccuracyPoint(
        date: json['date'] as String,
        actual: toDouble(json['actual']),
        likely: toDouble(json['likely']),
        low: toDouble(json['low']),
        high: toDouble(json['high']),
      );
}

class ReasonSlice {
  final String reason;
  final double plates;
  final double cost;

  const ReasonSlice({required this.reason, required this.plates, required this.cost});

  factory ReasonSlice.fromJson(Map<String, dynamic> json) => ReasonSlice(
        reason: json['reason'] as String? ?? '',
        plates: toDouble(json['plates']),
        cost: toDouble(json['cost']),
      );
}

/// HeatCell: waste for one dish on one weekday (0 = Monday).
class HeatCell {
  final String dishId;
  final String dishName;
  final int weekday;
  final double plates;
  final double cost;

  const HeatCell({
    required this.dishId,
    required this.dishName,
    required this.weekday,
    required this.plates,
    required this.cost,
  });

  factory HeatCell.fromJson(Map<String, dynamic> json) => HeatCell(
        dishId: json['dishId'] as String,
        dishName: json['dishName'] as String? ?? '',
        weekday: toInt(json['weekday']),
        plates: toDouble(json['plates']),
        cost: toDouble(json['cost']),
      );
}

class HeatmapResponse {
  final List<HeatCell> cells;

  const HeatmapResponse({required this.cells});

  factory HeatmapResponse.fromJson(Map<String, dynamic> json) => HeatmapResponse(
        cells: (json['cells'] as List? ?? [])
            .map((e) => HeatCell.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

/// Return value of savingsEstimate(): shares are percentages, null when unknown.
class SavingsEstimate {
  final double moneySaved;
  final double? baselineShare;
  final double? currentShare;
  final String note;

  const SavingsEstimate({required this.moneySaved, this.baselineShare, this.currentShare, required this.note});

  factory SavingsEstimate.fromJson(Map<String, dynamic>? json) => SavingsEstimate(
        moneySaved: toDouble(json?['moneySaved']),
        baselineShare: toDoubleOrNull(json?['baselineShare']),
        currentShare: toDoubleOrNull(json?['currentShare']),
        note: json?['note'] as String? ?? '',
      );
}

/// One row of nextDayExplanations(): why tomorrow's forecast is what it is.
class DayExplanation {
  final String dish;
  final int likely;
  final String? explanation;

  const DayExplanation({required this.dish, required this.likely, this.explanation});

  factory DayExplanation.fromJson(Map<String, dynamic> json) => DayExplanation(
        dish: json['dish'] as String? ?? '',
        likely: toInt(json['likely']),
        explanation: json['explanation'] as String?,
      );
}

class WasteBreakdown {
  final List<ReasonSlice> byReason;
  final double totalPlates;
  final double totalCost;

  const WasteBreakdown({required this.byReason, required this.totalPlates, required this.totalCost});

  factory WasteBreakdown.fromJson(Map<String, dynamic>? json) => WasteBreakdown(
        byReason: (json?['byReason'] as List? ?? [])
            .map((e) => ReasonSlice.fromJson(e as Map<String, dynamic>))
            .toList(),
        totalPlates: toDouble(json?['totalPlates']),
        totalCost: toDouble(json?['totalCost']),
      );
}

/// GET analytics.
class AnalyticsResponse {
  final List<DayPoint> sales;
  final List<AccuracyPoint> accuracy;
  final WasteBreakdown waste;
  final SavingsEstimate savings;
  final List<DayExplanation> explanations;

  const AnalyticsResponse({
    required this.sales,
    required this.accuracy,
    required this.waste,
    required this.savings,
    required this.explanations,
  });

  factory AnalyticsResponse.fromJson(Map<String, dynamic> json) {
    // The doc says AccuracyPoint[]; forecastAccuracy() itself returns
    // { n, mape, mae, coverage, series }, so accept either.
    final acc = json['accuracy'];
    final accList = acc is List ? acc : (acc is Map ? acc['series'] as List? ?? const [] : const []);
    return AnalyticsResponse(
      sales: (json['sales'] as List? ?? [])
          .map((e) => DayPoint.fromJson(e as Map<String, dynamic>))
          .toList(),
      accuracy: accList.map((e) => AccuracyPoint.fromJson(e as Map<String, dynamic>)).toList(),
      waste: WasteBreakdown.fromJson(json['waste'] as Map<String, dynamic>?),
      savings: SavingsEstimate.fromJson(json['savings'] as Map<String, dynamic>?),
      explanations: (json['explanations'] as List? ?? [])
          .map((e) => DayExplanation.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
