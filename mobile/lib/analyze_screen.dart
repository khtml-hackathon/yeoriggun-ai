import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:http/http.dart' as http;

class AnalyzeScreen extends StatefulWidget {
  const AnalyzeScreen({super.key});

  @override
  State<AnalyzeScreen> createState() => _AnalyzeScreenState();
}

class _AnalyzeScreenState extends State<AnalyzeScreen> {
  final TextEditingController _productController = TextEditingController();
  final TextEditingController _priceController = TextEditingController();
  final TextEditingController _qtyController = TextEditingController();

  final ImagePicker _picker = ImagePicker();
  File? _selectedImageFile;
  bool _isLoading = false;
  String? _error;

  static const String _apiBase = 'http://localhost:3000';

  Future<void> _pickImageAndAnalyze() async {
    setState(() {
      _error = null;
    });

    final XFile? picked =
        await _picker.pickImage(source: ImageSource.gallery, imageQuality: 95);
    if (picked == null) return;

    setState(() {
      _selectedImageFile = File(picked.path);
      _isLoading = true;
      _productController.clear();
      _priceController.clear();
      _qtyController.clear();
    });

    try {
      final uri = Uri.parse('$_apiBase/analyze');
      final request = http.MultipartRequest('POST', uri);
      request.files.add(
        await http.MultipartFile.fromPath('image', picked.path),
      );

      final streamed = await request.send();
      final resp = await http.Response.fromStream(streamed);

      if (resp.statusCode != 200) {
        throw Exception('Server error ${resp.statusCode}: ${resp.body}');
      }

      final Map<String, dynamic> data = json.decode(resp.body);

      final Map<String, dynamic> baskets =
          (data['baskets'] as Map?)?.map((k, v) => MapEntry('$k', v)) ?? {};
      final Map<String, dynamic> prices =
          (data['prices'] as Map?)?.map((k, v) => MapEntry('$k', v)) ?? {};

      String productName = '';
      int qty = 0;
      int price = 0;

      if (baskets.isNotEmpty) {
        final firstKey = baskets.keys.first;
        productName = firstKey;
        final rawQty = baskets[firstKey];
        if (rawQty is int) {
          qty = rawQty;
        } else if (rawQty is String) {
          qty = int.tryParse(rawQty) ?? 0;
        }
      }

      if (prices.isNotEmpty) {
        final firstPriceValue = prices.values.first;
        if (firstPriceValue is int) {
          price = firstPriceValue;
        } else if (firstPriceValue is String) {
          price = int.tryParse(firstPriceValue.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;
        }
      }

      _productController.text = productName;
      _priceController.text = price.toString();
      _qtyController.text = qty.toString();
    } catch (e) {
      setState(() {
        _error = e.toString();
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  void dispose() {
    _productController.dispose();
    _priceController.dispose();
    _qtyController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final imageWidget = _selectedImageFile != null
        ? ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.file(
              _selectedImageFile!,
              height: 220,
              width: double.infinity,
              fit: BoxFit.cover,
            ),
          )
        : Container(
            height: 220,
            width: double.infinity,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Colors.grey.shade200,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey.shade300),
            ),
            child: const Text('이미지를 선택해 주세요'),
          );

    return Scaffold(
      appBar: AppBar(
        title: const Text('과일 바구니 분석'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: ListView(
          children: [
            imageWidget,
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: _isLoading ? null : _pickImageAndAnalyze,
              icon: const Icon(Icons.photo),
              label: Text(_isLoading ? '분석 중...' : '이미지 선택 및 분석'),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _productController,
              decoration: const InputDecoration(
                labelText: '상품이름',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _priceController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: '가격',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _qtyController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: '수량',
                border: OutlineInputBorder(),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: const TextStyle(color: Colors.red),
              ),
            ],
          ],
        ),
      ),
    );
  }
}


