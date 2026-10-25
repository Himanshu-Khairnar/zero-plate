import 'json_utils.dart';

class Donation {
  final String id;
  final String date;
  final String? ngoName;
  final int meals;

  /// PLANNED | COLLECTED | CANCELLED
  final String status;

  const Donation({
    required this.id,
    required this.date,
    this.ngoName,
    required this.meals,
    required this.status,
  });

  factory Donation.fromJson(Map<String, dynamic> json) => Donation(
        id: json['id'] as String,
        date: json['date'] as String,
        ngoName: json['ngoName'] as String?,
        meals: toInt(json['meals']),
        status: json['status'] as String? ?? '',
      );
}

class DonationsResponse {
  final int mealsDonated;
  final List<Donation> items;

  const DonationsResponse({required this.mealsDonated, required this.items});

  factory DonationsResponse.fromJson(Map<String, dynamic> json) => DonationsResponse(
        mealsDonated: toInt(json['mealsDonated']),
        items: (json['items'] as List)
            .map((e) => Donation.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
