import 'json_utils.dart';

class ForecastItem {
  final String dishId;
  final String dishName;
  final int low;
  final int likely;
  final int high;

  const ForecastItem({
    required this.dishId,
    required this.dishName,
    required this.low,
    required this.likely,
    required this.high,
  });

  factory ForecastItem.fromJson(Map<String, dynamic> json) => ForecastItem(
        dishId: json['dishId'] as String,
        dishName: json['dishName'] as String,
        low: toInt(json['low']),
        likely: toInt(json['likely']),
        high: toInt(json['high']),
      );
}

class ForecastDay {
  final String date;
  final List<ForecastItem> items;

  const ForecastDay({required this.date, required this.items});

  int get totalLikely => items.fold(0, (sum, i) => sum + i.likely);

  factory ForecastDay.fromJson(Map<String, dynamic> json) => ForecastDay(
        date: json['date'] as String,
        items: (json['items'] as List)
            .map((e) => ForecastItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class ForecastsResponse {
  final List<ForecastDay> days;

  const ForecastsResponse({required this.days});

  factory ForecastsResponse.fromJson(Map<String, dynamic> json) => ForecastsResponse(
        days: (json['days'] as List)
            .map((e) => ForecastDay.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
