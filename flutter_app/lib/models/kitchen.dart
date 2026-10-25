import 'json_utils.dart';

enum Shift { lunch, dinner }

extension ShiftApi on Shift {
  String get apiValue => this == Shift.lunch ? 'LUNCH' : 'DINNER';
  String get label => this == Shift.lunch ? 'Lunch' : 'Dinner';
}

class ShiftCounts {
  final int prepared;
  final int sold;

  const ShiftCounts({required this.prepared, required this.sold});

  static const zero = ShiftCounts(prepared: 0, sold: 0);

  ShiftCounts copyWith({int? prepared, int? sold}) =>
      ShiftCounts(prepared: prepared ?? this.prepared, sold: sold ?? this.sold);

  factory ShiftCounts.fromJson(Map<String, dynamic>? json) => json == null
      ? zero
      : ShiftCounts(prepared: toInt(json['prepared']), sold: toInt(json['sold']));

  @override
  bool operator ==(Object other) =>
      other is ShiftCounts && other.prepared == prepared && other.sold == sold;

  @override
  int get hashCode => Object.hash(prepared, sold);
}

class KitchenDish {
  final String dishId;
  final String dishName;
  final int target;

  /// Day totals (LUNCH + DINNER).
  final int prepared;
  final int sold;
  final int leftover;

  /// This day's own row per shift (what kitchen/log overwrites).
  final Map<Shift, ShiftCounts> shifts;

  const KitchenDish({
    required this.dishId,
    required this.dishName,
    required this.target,
    required this.prepared,
    required this.sold,
    required this.leftover,
    required this.shifts,
  });

  ShiftCounts countsFor(Shift s) => shifts[s] ?? ShiftCounts.zero;

  factory KitchenDish.fromJson(Map<String, dynamic> json) {
    final shifts = json['shifts'] as Map<String, dynamic>? ?? const {};
    return KitchenDish(
      dishId: json['dishId'] as String,
      dishName: json['dishName'] as String,
      target: toInt(json['target']),
      prepared: toInt(json['prepared']),
      sold: toInt(json['sold']),
      leftover: toInt(json['leftover']),
      shifts: {
        for (final s in Shift.values)
          s: ShiftCounts.fromJson(shifts[s.apiValue] as Map<String, dynamic>?),
      },
    );
  }
}

class KitchenResponse {
  final String date;
  final bool locked;
  final List<KitchenDish> dishes;

  const KitchenResponse({required this.date, required this.locked, required this.dishes});

  factory KitchenResponse.fromJson(Map<String, dynamic> json) => KitchenResponse(
        date: json['date'] as String,
        locked: json['locked'] as bool? ?? false,
        dishes: (json['dishes'] as List)
            .map((e) => KitchenDish.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
