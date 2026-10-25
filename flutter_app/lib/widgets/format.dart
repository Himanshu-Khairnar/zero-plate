import 'package:intl/intl.dart';

final _num = NumberFormat.decimalPattern('en_IN');
final _num1 = NumberFormat('#,##0.0', 'en_IN');
final _rupee = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

String fmtNum(num v) => _num.format(v.round());
String fmtNum1(num v) => _num1.format(v);
String fmtRupees(num v) => _rupee.format(v);

/// Parses "YYYY-MM-DD" or an ISO timestamp; null if it can't.
DateTime? parseDate(String s) => DateTime.tryParse(s);

/// "Sat, 24 Oct"
String fmtDay(String s) {
  final d = parseDate(s);
  return d == null ? s : DateFormat('EEE, d MMM').format(d);
}

/// "24 Oct, 10:30"
String fmtDateTime(String s) {
  final d = parseDate(s);
  return d == null ? s : DateFormat('d MMM, HH:mm').format(d.toLocal());
}

/// "24/10" for chart axis labels.
String fmtShort(String s) {
  final d = parseDate(s);
  return d == null ? s : DateFormat('d/M').format(d);
}
