import 'json_utils.dart';

class StockBatch {
  final String? date;
  final String expiryDate;
  final double remaining;

  const StockBatch({this.date, required this.expiryDate, required this.remaining});

  factory StockBatch.fromJson(Map<String, dynamic> json) => StockBatch(
        date: json['date'] as String?,
        expiryDate: json['expiryDate'] as String? ?? '',
        remaining: toDouble(json['remaining']),
      );
}

class CheapestSupplier {
  final String id;
  final String name;
  final double price;
  final int leadTimeDays;

  const CheapestSupplier({required this.id, required this.name, required this.price, required this.leadTimeDays});

  factory CheapestSupplier.fromJson(Map<String, dynamic> json) => CheapestSupplier(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        price: toDouble(json['price']),
        leadTimeDays: toInt(json['leadTimeDays']),
      );
}

/// StockRow in frontend/src/lib/stock.ts.
class StockRow {
  final String ingredientId;
  final String name;
  final String unit;
  final double costPerUnit;
  final int shelfLifeDays;
  final double onHand;
  final double dailyUsage;
  final double? daysOfCover;
  final int leadTimeDays;
  final double reorderPoint;
  final double needLead;

  /// OK | LOW | OUT
  final String status;
  final String? nextExpiry;

  /// ok | soon | expired | null
  final String? expiryState;
  final List<StockBatch> batches;
  final CheapestSupplier? cheapestSupplier;

  const StockRow({
    required this.ingredientId,
    required this.name,
    required this.unit,
    this.costPerUnit = 0,
    this.shelfLifeDays = 0,
    required this.onHand,
    this.dailyUsage = 0,
    this.daysOfCover,
    this.leadTimeDays = 0,
    this.reorderPoint = 0,
    this.needLead = 0,
    required this.status,
    this.nextExpiry,
    this.expiryState,
    this.batches = const [],
    this.cheapestSupplier,
  });

  factory StockRow.fromJson(Map<String, dynamic> json) => StockRow(
        ingredientId: json['ingredientId'] as String,
        name: json['name'] as String? ?? '',
        unit: json['unit'] as String? ?? '',
        costPerUnit: toDouble(json['costPerUnit']),
        shelfLifeDays: toInt(json['shelfLifeDays']),
        onHand: toDouble(json['onHand']),
        dailyUsage: toDouble(json['dailyUsage']),
        daysOfCover: toDoubleOrNull(json['daysOfCover']),
        leadTimeDays: toInt(json['leadTimeDays']),
        reorderPoint: toDouble(json['reorderPoint']),
        needLead: toDouble(json['needLead']),
        status: json['status'] as String? ?? 'OK',
        nextExpiry: json['nextExpiry'] as String?,
        expiryState: json['expiryState'] as String?,
        batches: (json['batches'] as List? ?? [])
            .map((e) => StockBatch.fromJson(e as Map<String, dynamic>))
            .toList(),
        cheapestSupplier: json['cheapestSupplier'] == null
            ? null
            : CheapestSupplier.fromJson(json['cheapestSupplier'] as Map<String, dynamic>),
      );
}

class SuggestedOrderItem {
  final String ingredientId;
  final String name;
  final String unit;
  final double qty;
  final double unitPrice;
  final double onHand;
  final double need;

  const SuggestedOrderItem({
    required this.ingredientId,
    required this.name,
    required this.unit,
    required this.qty,
    required this.unitPrice,
    this.onHand = 0,
    this.need = 0,
  });

  double get total => qty * unitPrice;

  factory SuggestedOrderItem.fromJson(Map<String, dynamic> json) => SuggestedOrderItem(
        ingredientId: json['ingredientId'] as String,
        name: json['name'] as String? ?? '',
        unit: json['unit'] as String? ?? '',
        qty: toDouble(json['qty']),
        unitPrice: toDouble(json['unitPrice']),
        onHand: toDouble(json['onHand']),
        need: toDouble(json['need']),
      );
}

/// SuggestedOrder in frontend/src/lib/stock.ts.
class SuggestedOrder {
  final String? supplierId;
  final String? supplierName;
  final int leadTimeDays;
  final String expectedDate;
  final List<SuggestedOrderItem> items;

  const SuggestedOrder({
    this.supplierId,
    this.supplierName,
    required this.leadTimeDays,
    required this.expectedDate,
    required this.items,
  });

  double get total => items.fold(0, (s, i) => s + i.total);

  factory SuggestedOrder.fromJson(Map<String, dynamic> json) => SuggestedOrder(
        supplierId: json['supplierId'] as String?,
        supplierName: json['supplierName'] as String?,
        leadTimeDays: toInt(json['leadTimeDays']),
        expectedDate: json['expectedDate'] as String? ?? '',
        items: (json['items'] as List? ?? [])
            .map((e) => SuggestedOrderItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

/// GET inventory: `{ rows: StockRow[], suggestedOrders: SuggestedOrder[] }`.
class InventoryResponse {
  final List<StockRow> rows;
  final List<SuggestedOrder> suggestedOrders;

  const InventoryResponse({required this.rows, required this.suggestedOrders});

  factory InventoryResponse.fromJson(Map<String, dynamic> json) => InventoryResponse(
        rows: (json['rows'] as List? ?? [])
            .map((e) => StockRow.fromJson(e as Map<String, dynamic>))
            .toList(),
        suggestedOrders: (json['suggestedOrders'] as List? ?? [])
            .map((e) => SuggestedOrder.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}
