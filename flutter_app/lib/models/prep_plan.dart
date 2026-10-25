import 'json_utils.dart';

class PrepPlanItem {
  final String id;
  final String dishId;
  final String dishName;
  final int forecastQty;
  final int plannedQty;
  final String unit;

  const PrepPlanItem({
    required this.id,
    required this.dishId,
    required this.dishName,
    required this.forecastQty,
    required this.plannedQty,
    required this.unit,
  });

  factory PrepPlanItem.fromJson(Map<String, dynamic> json) => PrepPlanItem(
        id: json['id'] as String,
        dishId: json['dishId'] as String,
        dishName: json['dishName'] as String,
        forecastQty: toInt(json['forecastQty']),
        plannedQty: toInt(json['plannedQty']),
        unit: json['unit'] as String? ?? 'plates',
      );
}

class PrepPlan {
  final String id;
  final String date;

  /// DRAFT | APPROVED | LOCKED
  final String status;
  final List<PrepPlanItem> items;

  const PrepPlan({required this.id, required this.date, required this.status, required this.items});

  bool get isDraft => status == 'DRAFT';

  /// LOCKED is treated like APPROVED in the UI.
  bool get isApproved => status == 'APPROVED' || status == 'LOCKED';

  factory PrepPlan.fromJson(Map<String, dynamic> json) => PrepPlan(
        id: json['id'] as String,
        date: json['date'] as String,
        status: json['status'] as String,
        items: (json['items'] as List)
            .map((e) => PrepPlanItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class PrepPlanResponse {
  /// null when no plan has been drafted (drafting is web-only).
  final PrepPlan? plan;

  const PrepPlanResponse({this.plan});

  factory PrepPlanResponse.fromJson(Map<String, dynamic> json) => PrepPlanResponse(
        plan: json['plan'] == null ? null : PrepPlan.fromJson(json['plan'] as Map<String, dynamic>),
      );
}
