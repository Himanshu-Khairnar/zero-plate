import 'json_utils.dart';

/// One recipe line of a dish (RecipeLine in frontend/src/lib/prep.ts).
class RecipeLine {
  final String ingredientId;
  final String name;
  final String unit;
  final double costPerUnit;
  final double qtyPerPlate;

  const RecipeLine({
    required this.ingredientId,
    required this.name,
    required this.unit,
    required this.costPerUnit,
    required this.qtyPerPlate,
  });

  factory RecipeLine.fromJson(Map<String, dynamic> json) => RecipeLine(
        ingredientId: json['ingredientId'] as String,
        name: json['name'] as String? ?? '',
        unit: json['unit'] as String? ?? '',
        costPerUnit: toDouble(json['costPerUnit']),
        qtyPerPlate: toDouble(json['qtyPerPlate']),
      );
}

/// PlanItemView in frontend/src/lib/prep-plans.ts.
class PlanItemView {
  final String id;
  final String dishId;
  final String dishName;
  final String category;
  final double price;
  final double forecastLow;
  final double forecastLikely;
  final double forecastHigh;
  final double riskWeight;
  final double costPerPlate;
  final int suggestedQty;
  final int plannedQty;
  final String? explanation;
  final List<RecipeLine> recipe;

  const PlanItemView({
    required this.id,
    required this.dishId,
    required this.dishName,
    this.category = '',
    this.price = 0,
    required this.forecastLow,
    required this.forecastLikely,
    required this.forecastHigh,
    this.riskWeight = 0.5,
    this.costPerPlate = 0,
    required this.suggestedQty,
    required this.plannedQty,
    this.explanation,
    this.recipe = const [],
  });

  /// Same wording as the web editor's risk badge.
  String get riskLabel => riskWeight >= 0.75
      ? 'lean high'
      : riskWeight <= 0.35
          ? 'lean likely'
          : 'balanced';

  factory PlanItemView.fromJson(Map<String, dynamic> json) => PlanItemView(
        id: json['id'] as String,
        dishId: json['dishId'] as String,
        dishName: json['dishName'] as String? ?? '',
        category: json['category'] as String? ?? '',
        price: toDouble(json['price']),
        forecastLow: toDouble(json['forecastLow']),
        forecastLikely: toDouble(json['forecastLikely']),
        forecastHigh: toDouble(json['forecastHigh']),
        riskWeight: toDouble(json['riskWeight']),
        costPerPlate: toDouble(json['costPerPlate']),
        suggestedQty: toInt(json['suggestedQty']),
        plannedQty: toInt(json['plannedQty']),
        explanation: json['explanation'] as String?,
        recipe: (json['recipe'] as List? ?? [])
            .map((e) => RecipeLine.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

/// IngredientNeed in frontend/src/lib/prep.ts.
class IngredientNeed {
  final String ingredientId;
  final String name;
  final String unit;
  final double qty;
  final double cost;
  final List<String> dishNames;

  const IngredientNeed({
    required this.ingredientId,
    required this.name,
    required this.unit,
    required this.qty,
    required this.cost,
    this.dishNames = const [],
  });

  factory IngredientNeed.fromJson(Map<String, dynamic> json) => IngredientNeed(
        ingredientId: json['ingredientId'] as String,
        name: json['name'] as String? ?? '',
        unit: json['unit'] as String? ?? '',
        qty: toDouble(json['qty']),
        cost: toDouble(json['cost']),
        dishNames: (json['dishes'] as List? ?? [])
            .map((e) => (e as Map<String, dynamic>)['dishName'] as String? ?? '')
            .toList(),
      );
}

class PlanTotals {
  final int plates;
  final double prepCost;
  final int forecastLikely;

  const PlanTotals({required this.plates, required this.prepCost, required this.forecastLikely});

  factory PlanTotals.fromJson(Map<String, dynamic>? json) => PlanTotals(
        plates: toInt(json?['plates']),
        prepCost: toDouble(json?['prepCost']),
        forecastLikely: toInt(json?['forecastLikely']),
      );
}

class PlanAdjustment {
  final String id;
  final String dishName;
  final int fromQty;
  final int toQty;
  final String? reason;
  final String adjustedBy;
  final String createdAt;

  const PlanAdjustment({
    required this.id,
    required this.dishName,
    required this.fromQty,
    required this.toQty,
    this.reason,
    required this.adjustedBy,
    required this.createdAt,
  });

  factory PlanAdjustment.fromJson(Map<String, dynamic> json) => PlanAdjustment(
        id: json['id'] as String,
        dishName: json['dishName'] as String? ?? '',
        fromQty: toInt(json['fromQty']),
        toQty: toInt(json['toQty']),
        reason: json['reason'] as String?,
        adjustedBy: json['adjustedBy'] as String? ?? '',
        createdAt: json['createdAt'] as String? ?? '',
      );
}

/// PlanView in frontend/src/lib/prep-plans.ts (GET prep-plan/full, generate, adjust).
class PlanView {
  final String id;
  final String outletId;
  final String date;

  /// DRAFT | APPROVED | LOCKED
  final String status;
  final String? approvedBy;
  final String? approvedAt;
  final String? notes;
  final String? modelVersion;
  final List<PlanItemView> items;
  final List<IngredientNeed> ingredients;
  final PlanTotals totals;
  final List<PlanAdjustment> adjustments;

  const PlanView({
    required this.id,
    this.outletId = '',
    required this.date,
    required this.status,
    this.approvedBy,
    this.approvedAt,
    this.notes,
    this.modelVersion,
    required this.items,
    this.ingredients = const [],
    this.totals = const PlanTotals(plates: 0, prepCost: 0, forecastLikely: 0),
    this.adjustments = const [],
  });

  bool get isDraft => status == 'DRAFT';
  bool get isApproved => status == 'APPROVED';
  bool get isLocked => status == 'LOCKED';

  factory PlanView.fromJson(Map<String, dynamic> json) => PlanView(
        id: json['id'] as String,
        outletId: json['outletId'] as String? ?? '',
        date: json['date'] as String,
        status: json['status'] as String? ?? 'DRAFT',
        approvedBy: json['approvedBy'] as String?,
        approvedAt: json['approvedAt'] as String?,
        notes: json['notes'] as String?,
        modelVersion: json['modelVersion'] as String?,
        items: (json['items'] as List? ?? [])
            .map((e) => PlanItemView.fromJson(e as Map<String, dynamic>))
            .toList(),
        ingredients: (json['ingredients'] as List? ?? [])
            .map((e) => IngredientNeed.fromJson(e as Map<String, dynamic>))
            .toList(),
        totals: PlanTotals.fromJson(json['totals'] as Map<String, dynamic>?),
        adjustments: (json['adjustments'] as List? ?? [])
            .map((e) => PlanAdjustment.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

/// `{ plan: PlanView | null }`
PlanView? planFromResponse(Map<String, dynamic> json) =>
    json['plan'] == null ? null : PlanView.fromJson(json['plan'] as Map<String, dynamic>);
