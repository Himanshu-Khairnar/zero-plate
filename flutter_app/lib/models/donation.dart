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

/// NGO from GET donations/ngos.
class Ngo {
  final String id;
  final String name;
  final String? city;
  final String? contact;
  final bool acceptsCooked;

  const Ngo({required this.id, required this.name, this.city, this.contact, this.acceptsCooked = true});

  factory Ngo.fromJson(Map<String, dynamic> json) => Ngo(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        city: json['city'] as String?,
        contact: json['contact'] as String?,
        acceptsCooked: json['acceptsCooked'] as bool? ?? true,
      );
}

List<Ngo> ngosFromResponse(Map<String, dynamic> json) =>
    (json['items'] as List? ?? []).map((e) => Ngo.fromJson(e as Map<String, dynamic>)).toList();

/// SurplusLine in frontend/src/actions/donations.ts.
class SurplusLine {
  final String dishId;
  final String dishName;
  final int plates;

  /// plan | kitchen
  final String source;

  const SurplusLine({required this.dishId, required this.dishName, required this.plates, required this.source});

  factory SurplusLine.fromJson(Map<String, dynamic> json) => SurplusLine(
        dishId: json['dishId'] as String,
        dishName: json['dishName'] as String? ?? '',
        plates: toInt(json['plates']),
        source: json['source'] as String? ?? '',
      );
}

/// SurplusEstimate in frontend/src/actions/donations.ts (GET donations/suggest).
class SurplusEstimate {
  final String date;
  final int total;
  final List<SurplusLine> lines;

  const SurplusEstimate({required this.date, required this.total, required this.lines});

  factory SurplusEstimate.fromJson(Map<String, dynamic> json) => SurplusEstimate(
        date: json['date'] as String? ?? '',
        total: toInt(json['total']),
        lines: (json['lines'] as List? ?? [])
            .map((e) => SurplusLine.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
