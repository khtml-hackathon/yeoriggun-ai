class SttResult {
  final String text;
  final String summary;

  SttResult({required this.text, required this.summary});

  factory SttResult.fromJson(Map<String, dynamic> json) {
    return SttResult(
      text: (json['text'] ?? '').toString(),
      summary: (json['summary'] ?? '').toString(),
    );
  }
}


