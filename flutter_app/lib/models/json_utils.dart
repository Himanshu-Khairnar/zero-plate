/// Small helpers for reading JSON numbers safely (ints and doubles both arrive as num).
double toDouble(Object? v) => v == null ? 0 : (v as num).toDouble();
int toInt(Object? v) => v == null ? 0 : (v as num).round();
double? toDoubleOrNull(Object? v) => v == null ? null : (v as num).toDouble();
