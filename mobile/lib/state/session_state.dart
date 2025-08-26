import 'dart:io';

import 'package:flutter/foundation.dart';
import '../models/analyze_result.dart';
import '../models/stt_result.dart';

class SessionState extends ChangeNotifier {
  File? selectedImage;
  AnalyzeResult? analyzeResult;
  File? recordedAudio;
  SttResult? sttResult;

  void setImage(File file) {
    selectedImage = file;
    analyzeResult = null;
    notifyListeners();
  }

  void setAnalyzeResult(AnalyzeResult result) {
    analyzeResult = result;
    notifyListeners();
  }

  void setAudio(File file) {
    recordedAudio = file;
    sttResult = null;
    notifyListeners();
  }

  void setSttResult(SttResult result) {
    sttResult = result;
    notifyListeners();
  }
}


