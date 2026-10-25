import 'json_utils.dart';

class WasteItem {
  final String id;
  final String date;
  final String? dishName;
  final String? ingredientName;
  final double qty;
  final String unit;
  final String reason;

  /// Rupees, rounded.
  final double value;

  const WasteItem({
    required this.id,
    required this.date,
    this.dishName,
    this.ingredientName,
    required this.qty,
    required this.unit,
    required this.reason,
    required this.value,
  });

  String get name => dishName ?? ingredientName ?? 'Unknown';

  factory WasteItem.fromJson(Map<String, dynamic> json) => WasteItem(
        id: json['id'] as String,
        date: json['date'] as String,
        dishName: json['dishName'] as String?,
        ingredientName: json['ingredientName'] as String?,
        qty: toDouble(json['qty']),
        unit: json['unit'] as String? ?? '',
        reason: json['reason'] as String? ?? '',
        value: toDouble(json['value']),
      );
}

class WasteResponse {
  final List<WasteItem> items;

  const WasteResponse({required this.items});

  factory WasteResponse.fromJson(Map<String, dynamic> json) => WasteResponse(
        items: (json['items'] as List)
            .map((e) => WasteItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class NamedOption {
  final String id;
  final String name;

  /// Only set for ingredients.
  final String? unit;

  const NamedOption({required this.id, required this.name, this.unit});

  factory NamedOption.fromJson(Map<String, dynamic> json) => NamedOption(
        id: json['id'] as String,
        name: json['name'] as String,
        unit: json['unit'] as String?,
      );
}

class WasteOptions {
  final List<NamedOption> dishes;
  final List<NamedOption> ingredients;
  final List<String> reasons;

  const WasteOptions({required this.dishes, required this.ingredients, required this.reasons});

  factory WasteOptions.fromJson(Map<String, dynamic> json) => WasteOptions(
        dishes: (json['dishes'] as List)
            .map((e) => NamedOption.fromJson(e as Map<String, dynamic>))
            .toList(),
        ingredients: (json['ingredients'] as List)
            .map((e) => NamedOption.fromJson(e as Map<String, dynamic>))
            .toList(),
        reasons: (json['reasons'] as List).cast<String>(),
      );
}

/// "plate_waste" becomes "Plate waste".
String reasonLabel(String reason) {
  final s = reason.replaceAll('_', ' ');
  return s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);
}
