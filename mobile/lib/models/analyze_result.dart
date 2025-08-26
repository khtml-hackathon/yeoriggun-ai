class AnalyzeResult {
  final Map<String, dynamic> baskets;
  final Map<String, dynamic> prices;

  AnalyzeResult({required this.baskets, required this.prices});

  factory AnalyzeResult.fromJson(Map<String, dynamic> json) {
    final b = (json['baskets'] as Map?)?.map((k, v) => MapEntry('$k', v)) ?? {};
    final p = (json['prices'] as Map?)?.map((k, v) => MapEntry('$k', v)) ?? {};
    return AnalyzeResult(baskets: b, prices: p);
  }

  String get productName => baskets.isNotEmpty ? baskets.keys.first : '';
  int get quantity {
    if (baskets.isEmpty) return 0;
    final v = baskets.values.first;
    if (v is int) return v;
    if (v is String) return int.tryParse(v) ?? 0;
    return 0;
  }

  int get price {
    if (prices.isEmpty) return 0;
    final v = prices.values.first;
    if (v is int) return v;
    if (v is String) return int.tryParse(v.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;
    return 0;
  }
}


