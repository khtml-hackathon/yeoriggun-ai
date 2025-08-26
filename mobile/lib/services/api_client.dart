import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import '../models/analyze_result.dart';
import '../models/stt_result.dart';

class ApiClient {
  ApiClient(this.baseUrl);

  final String baseUrl; // e.g., http://localhost:3000 or http://10.0.2.2:3000

  Future<AnalyzeResult> analyzeImage(File imageFile) async {
    final uri = Uri.parse('$baseUrl/analyze');
    final req = http.MultipartRequest('POST', uri)
      ..files.add(await http.MultipartFile.fromPath('image', imageFile.path));
    final streamed = await req.send();
    final resp = await http.Response.fromStream(streamed);
    if (resp.statusCode != 200) {
      throw Exception('analyze failed: ${resp.statusCode} ${resp.body}');
    }
    final data = json.decode(resp.body) as Map<String, dynamic>;
    return AnalyzeResult.fromJson(data);
  }

  Future<SttResult> sttSummarize(File wavFile) async {
    final uri = Uri.parse('$baseUrl/stt-summarize');
    final bytes = await wavFile.readAsBytes();
    final resp = await http.post(
      uri,
      headers: { 'Content-Type': 'audio/wav' },
      body: bytes,
    );
    if (resp.statusCode != 200) {
      throw Exception('stt-summarize failed: ${resp.statusCode} ${resp.body}');
    }
    final data = json.decode(resp.body) as Map<String, dynamic>;
    return SttResult.fromJson(data);
  }
}


