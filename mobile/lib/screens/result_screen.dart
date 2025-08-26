import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/session_state.dart';

class ResultScreen extends StatelessWidget {
  ResultScreen({super.key});

  final TextEditingController _product = TextEditingController();
  final TextEditingController _price = TextEditingController();
  final TextEditingController _qty = TextEditingController();
  final TextEditingController _summary = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<SessionState>();
    final img = state.selectedImage;
    final ar = state.analyzeResult;
    final stt = state.sttResult;

    _product.text = ar?.productName ?? '';
    _price.text = (ar?.price ?? 0).toString();
    _qty.text = (ar?.quantity ?? 0).toString();
    _summary.text = stt?.summary ?? '';

    return Scaffold(
      appBar: AppBar(title: const Text('3) 결과 확인')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: ListView(
          children: [
            if (img != null)
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.file(img, height: 220, fit: BoxFit.cover),
              ),
            const SizedBox(height: 16),
            TextField(
              controller: _product,
              decoration: const InputDecoration(labelText: '상품이름', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _price,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: '가격', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _qty,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: '수량', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _summary,
              maxLines: 5,
              decoration: const InputDecoration(labelText: '요약', border: OutlineInputBorder()),
            ),
          ],
        ),
      ),
    );
  }
}


