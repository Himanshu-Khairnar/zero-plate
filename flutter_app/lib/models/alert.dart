class AlertItem {
  final String id;
  final String type;

  /// info | warning | critical
  final String severity;
  final String title;
  final String message;
  final String createdAt;
  final bool read;

  const AlertItem({
    required this.id,
    required this.type,
    required this.severity,
    required this.title,
    required this.message,
    required this.createdAt,
    required this.read,
  });

  factory AlertItem.fromJson(Map<String, dynamic> json) => AlertItem(
        id: json['id'] as String,
        type: json['type'] as String? ?? '',
        severity: json['severity'] as String? ?? 'info',
        title: json['title'] as String? ?? '',
        message: json['message'] as String? ?? '',
        createdAt: json['createdAt'] as String,
        read: json['read'] as bool? ?? false,
      );
}

class AlertsResponse {
  final List<AlertItem> items;

  const AlertsResponse({required this.items});

  factory AlertsResponse.fromJson(Map<String, dynamic> json) => AlertsResponse(
        items: (json['items'] as List)
            .map((e) => AlertItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
