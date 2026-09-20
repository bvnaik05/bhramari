import 'dart:convert';

import 'package:http/http.dart' as http;

const apiUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'http://10.0.2.2:8000/api/v1',
);

class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  String? token;

  Future<Map<String, dynamic>> login(String email, String password) async {
    final result = await _request('POST', '/auth/demo', {
      'email': email,
      'password': password,
    });
    token = result['access_token'] as String;
    return result;
  }

  Future<List<Map<String, dynamic>>> list(String path) async {
    final value = await _request('GET', path);
    return (value as List).cast<Map<String, dynamic>>();
  }

  Future<dynamic> get(String path) => _request('GET', path);

  Future<Map<String, dynamic>> post(String path, Object body) async =>
      (await _request('POST', path, body)) as Map<String, dynamic>;

  Future<Map<String, dynamic>> transcribe(
    String filePath,
    String language,
  ) async {
    final request =
        http.MultipartRequest('POST', Uri.parse('$apiUrl/languages/transcribe'))
          ..fields['language_code'] = language
          ..files.add(await http.MultipartFile.fromPath('audio', filePath));
    if (token != null) request.headers['authorization'] = 'Bearer $token';
    final response = await request.send();
    final text = await response.stream.bytesToString();
    final value = text.isEmpty
        ? <String, dynamic>{}
        : jsonDecode(text) as Map<String, dynamic>;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        response.statusCode,
        value['detail']?.toString() ?? 'Speech input failed.',
      );
    }
    return value;
  }

  Future<dynamic> _request(String method, String path, [Object? body]) async {
    final response = await _client.send(
      http.Request(method, Uri.parse('$apiUrl$path'))
        ..headers.addAll({
          'accept': 'application/json',
          if (token != null) 'authorization': 'Bearer $token',
          if (body != null) 'content-type': 'application/json',
        })
        ..body = body == null ? '' : jsonEncode(body),
    );
    final text = await response.stream.bytesToString();
    final value = text.isEmpty ? null : jsonDecode(text);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(
        response.statusCode,
        value is Map ? value['detail']?.toString() ?? text : text,
      );
    }
    return value;
  }
}

class ApiException implements Exception {
  const ApiException(this.status, this.message);
  final int status;
  final String message;

  @override
  String toString() => message;
}
