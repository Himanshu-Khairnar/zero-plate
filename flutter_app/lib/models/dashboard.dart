import 'json_utils.dart';

class Kpis {
  final double forecastCovers;
  final double wasteKg;
  final double wasteValue;
  final double revenue;

  /// null until forecasts and actuals overlap.
  final double? accuracyPct;
  final double mealsDonated;

  const Kpis({
    required this.forecastCovers,
    required this.wasteKg,
    required this.wasteValue,
    required this.revenue,
    required this.accuracyPct,
    required this.mealsDonated,
  });

  factory Kpis.fromJson(Map<String, dynamic> json) => Kpis(
        forecastCovers: toDouble(json['forecastCovers']),
        wasteKg: toDouble(json['wasteKg']),
        wasteValue: toDouble(json['wasteValue']),
        revenue: toDouble(json['revenue']),
        accuracyPct: json['accuracyPct'] == null ? null : toDouble(json['accuracyPct']),
        mealsDonated: toDouble(json['mealsDonated']),
      );
}

class WastePoint {
  final String date;
  final double wasteKg;

  const WastePoint({required this.date, required this.wasteKg});

  factory WastePoint.fromJson(Map<String, dynamic> json) =>
      WastePoint(date: json['date'] as String, wasteKg: toDouble(json['wasteKg']));
}

class Dashboard {
  final String date;
  final Kpis kpis;
  final int alertsOpen;

  /// Tomorrow's plan: NONE | DRAFT | APPROVED (LOCKED is reported as APPROVED).
  final String prepStatus;
  final List<WastePoint> wasteTrend;

  const Dashboard({
    required this.date,
    required this.kpis,
    required this.alertsOpen,
    required this.prepStatus,
    required this.wasteTrend,
  });

  factory Dashboard.fromJson(Map<String, dynamic> json) => Dashboard(
        date: json['date'] as String,
        kpis: Kpis.fromJson(json['kpis'] as Map<String, dynamic>),
        alertsOpen: toInt(json['alertsOpen']),
        prepStatus: json['prepStatus'] as String? ?? 'NONE',
        wasteTrend: (json['wasteTrend'] as List? ?? [])
            .map((e) => WastePoint.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
