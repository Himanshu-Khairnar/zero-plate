import 'json_utils.dart';

/// VisionSuggestion in frontend/src/actions/waste.ts.
class VisionSuggestion {
  final String label;
  final String? dishName;

  /// Set by the server when [dishName] matches a dish of the outlet.
  final String? dishId;
  final double estimatedQty;

  /// 0..1
  final double confidence;

  const VisionSuggestion({
    required this.label,
    this.dishName,
    this.dishId,
    required this.estimatedQty,
    required this.confidence,
  });

  String get displayName => dishName ?? label;

  factory VisionSuggestion.fromJson(Map<String, dynamic> json) => VisionSuggestion(
        label: json['label'] as String? ?? '',
        dishName: json['dishName'] as String?,
        dishId: json['dishId'] as String?,
        estimatedQty: toDouble(json['estimatedQty']),
        confidence: toDouble(json['confidence']),
      );
}

/// VisionResult in frontend/src/actions/waste.ts (POST waste/recognize).
class VisionResult {
  final List<VisionSuggestion> items;
  final String model;
  final String note;

  const VisionResult({required this.items, required this.model, required this.note});

  factory VisionResult.fromJson(Map<String, dynamic> json) => VisionResult(
        items: (json['items'] as List? ?? [])
            .map((e) => VisionSuggestion.fromJson(e as Map<String, dynamic>))
            .toList(),
        model: json['model'] as String? ?? '',
        note: json['note'] as String? ?? '',
      );
}

/// Values handed to the waste log form (e.g. from a photo suggestion).
class WastePrefill {
  final String? dishId;
  final double? qty;
  final String? note;

  const WastePrefill({this.dishId, this.qty, this.note});

  factory WastePrefill.fromSuggestion(VisionSuggestion s) => WastePrefill(
        dishId: s.dishId,
        qty: s.estimatedQty > 0 ? s.estimatedQty : null,
        note: 'Photo: ${s.label} (${(s.confidence * 100).round()}% confidence)',
      );
}
