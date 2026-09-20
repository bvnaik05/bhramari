import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api.dart';
import 'vault.dart';

const honey = Color(0xffffb000);
const ink = Color(0xff241500);

class BhramariApp extends StatelessWidget {
  const BhramariApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Bhramari Field',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: honey, brightness: Brightness.light),
          scaffoldBackgroundColor: const Color(0xfffffbf2),
          cardTheme: const CardThemeData(elevation: 0, color: Colors.white, margin: EdgeInsets.zero),
          inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
          useMaterial3: true,
        ),
        home: const FieldApp(),
      );
}

class FieldApp extends StatefulWidget {
  const FieldApp({super.key});

  @override
  State<FieldApp> createState() => _FieldAppState();
}

class _FieldAppState extends State<FieldApp> {
  final api = ApiClient();
  final secure = const FlutterSecureStorage();
  late final FieldVault vault = FieldVault(api);
  Map<String, dynamic>? user;
  List<Map<String, dynamic>> hives = [];
  List<Map<String, dynamic>> languages = [];
  int pending = 0;
  bool busy = true;
  String? error;

  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    await vault.open();
    final token = await secure.read(key: 'session.token');
    final saved = await secure.read(key: 'session.user');
    if (token != null && saved != null) {
      api.token = token;
      user = jsonDecode(saved) as Map<String, dynamic>;
      await _refresh();
    }
    pending = await vault.pendingCount();
    if (mounted) setState(() => busy = false);
  }

  Future<void> _login(String email, String password) async {
    setState(() { busy = true; error = null; });
    try {
      final session = await api.login(email, password);
      user = session['user'] as Map<String, dynamic>;
      await secure.write(key: 'session.token', value: api.token);
      await secure.write(key: 'session.user', value: jsonEncode(user));
      await vault.registerDevice();
      await _refresh();
    } catch (failure) {
      error = failure.toString();
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _refresh() async {
    try {
      hives = await api.list('/hives');
      final manifest = await api.get('/languages') as Map<String, dynamic>;
      languages = (manifest['languages'] as List).cast<Map<String, dynamic>>();
    } catch (failure) {
      error = 'Offline mode · showing records already on this device';
    }
    pending = await vault.pendingCount();
    if (mounted) setState(() {});
  }

  Future<void> _sync() async {
    setState(() { busy = true; error = null; });
    try {
      final receipts = await vault.sync();
      error = receipts.isEmpty ? 'Nothing is waiting to sync.' : '${receipts.length} signed record(s) reconciled.';
    } catch (failure) {
      error = 'Still offline. Your signed records remain encrypted on this device.';
    } finally {
      pending = await vault.pendingCount();
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _logout() async {
    await secure.delete(key: 'session.token');
    await secure.delete(key: 'session.user');
    api.token = null;
    setState(() { user = null; hives = []; });
  }

  @override
  Widget build(BuildContext context) {
    if (busy && user == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (user == null) return LoginScreen(onLogin: _login, busy: busy, error: error);
    return HomeScreen(
      user: user!, hives: hives, languages: languages, pending: pending, busy: busy,
      message: error, onRefresh: _refresh, onSync: _sync, onLogout: _logout,
      onHarvest: (hive, grams, floral, notes) async {
        await vault.queueHarvest(user: user!, hiveId: hive, quantityG: grams, floral: floral, notes: notes);
        pending = await vault.pendingCount();
        setState(() => error = 'Harvest signed and saved in the encrypted offline vault.');
      },
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.onLogin, required this.busy, this.error});
  final Future<void> Function(String, String) onLogin;
  final bool busy;
  final String? error;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final email = TextEditingController(text: 'beekeeper@bhramari.local');
  final password = TextEditingController(text: 'demo-honey-2026');

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(child: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 440),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const _Brand(), const SizedBox(height: 38),
            const Text('Field records that travel with the honey.', style: TextStyle(fontSize: 34, fontWeight: FontWeight.w800, height: 1.05, color: ink)),
            const SizedBox(height: 12),
            const Text('Sign harvests on this phone, keep working without a signal, and reconcile safely when connectivity returns.'),
            const SizedBox(height: 28),
            TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email')),
            const SizedBox(height: 12),
            TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
            const SizedBox(height: 16),
            FilledButton(onPressed: widget.busy ? null : () => widget.onLogin(email.text.trim(), password.text), child: Text(widget.busy ? 'Opening…' : 'Open field workspace')),
            if (widget.error != null) Padding(padding: const EdgeInsets.only(top: 14), child: Text(widget.error!, style: const TextStyle(color: Colors.red))),
            const SizedBox(height: 16),
            const Text('This build uses the explicit simulated demo account. Production sign-in uses the configured identity provider.', style: TextStyle(fontSize: 12, color: Colors.black54)),
          ]),
        )))),
      );
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.user, required this.hives, required this.languages, required this.pending, required this.busy, required this.onRefresh, required this.onSync, required this.onLogout, required this.onHarvest, this.message});
  final Map<String, dynamic> user;
  final List<Map<String, dynamic>> hives;
  final List<Map<String, dynamic>> languages;
  final int pending;
  final bool busy;
  final String? message;
  final Future<void> Function() onRefresh, onSync, onLogout;
  final Future<void> Function(String, int, String, String) onHarvest;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const _Brand(), actions: [IconButton(onPressed: onLogout, tooltip: 'Sign out', icon: const Icon(Icons.logout))]),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: hives.isEmpty ? null : () => showDialog(context: context, builder: (_) => HarvestDialog(hives: hives, onSave: onHarvest)),
          icon: const Icon(Icons.add), label: const Text('Harvest'),
        ),
        body: RefreshIndicator(onRefresh: onRefresh, child: ListView(padding: const EdgeInsets.fromLTRB(20, 16, 20, 100), children: [
          Text('Namaste, ${user['name']}', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: ink)),
          const SizedBox(height: 6), Text('${user['role']} · ${user['org_id']}', style: const TextStyle(color: Colors.black54)),
          const SizedBox(height: 20),
          Card(child: Padding(padding: const EdgeInsets.all(18), child: Row(children: [
            const CircleAvatar(backgroundColor: Color(0xffffe4a3), child: Icon(Icons.shield_outlined, color: ink)),
            const SizedBox(width: 14), Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('$pending record${pending == 1 ? '' : 's'} waiting', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)), const Text('Encrypted, signed, and chained on this device')])) ,
            FilledButton.tonal(onPressed: busy || pending == 0 ? null : onSync, child: const Text('Sync')),
          ]))),
          if (message != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(message!, style: const TextStyle(color: Color(0xff765000)))),
          const SizedBox(height: 28),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [const Text('Your hives', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)), Text('${hives.length} registered')]),
          const SizedBox(height: 10),
          ...hives.map((hive) => Card(child: ListTile(leading: const CircleAvatar(backgroundColor: Color(0xfffff0c7), child: Icon(Icons.hexagon_outlined, color: Color(0xff9a6500))), title: Text(hive['name']?.toString() ?? 'Hive'), subtitle: Text('${hive['region']} · ${hive['floral']}'), trailing: Text(hive['status']?.toString() ?? '')))).expand((widget) => [widget, const SizedBox(height: 8)]),
          const SizedBox(height: 20),
          Card(child: ListTile(leading: const Icon(Icons.translate, color: Color(0xff9a6500)), title: Text('${languages.length} provider-supported languages'), subtitle: const Text('Language choices are loaded from Bhramari’s provider capability manifest.'))),
        ])),
      );
}

class HarvestDialog extends StatefulWidget {
  const HarvestDialog({super.key, required this.hives, required this.onSave});
  final List<Map<String, dynamic>> hives;
  final Future<void> Function(String, int, String, String) onSave;
  @override
  State<HarvestDialog> createState() => _HarvestDialogState();
}

class _HarvestDialogState extends State<HarvestDialog> {
  late String hive = widget.hives.first['id'] as String;
  final quantity = TextEditingController();
  final floral = TextEditingController(text: 'Multiflora');
  final notes = TextEditingController();
  String? error;

  @override
  Widget build(BuildContext context) => AlertDialog(title: const Text('Record harvest'), content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, children: [
    DropdownButtonFormField<String>(initialValue: hive, decoration: const InputDecoration(labelText: 'Hive'), items: widget.hives.map((item) => DropdownMenuItem(value: item['id'] as String, child: Text(item['name'] as String))).toList(), onChanged: (value) => hive = value!),
    const SizedBox(height: 12), TextField(controller: quantity, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Quantity (grams)')),
    const SizedBox(height: 12), TextField(controller: floral, decoration: const InputDecoration(labelText: 'Floral source')),
    const SizedBox(height: 12), TextField(controller: notes, decoration: const InputDecoration(labelText: 'Notes (optional)')),
    if (error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(error!, style: const TextStyle(color: Colors.red))),
  ])), actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')), FilledButton(onPressed: () async {
    final grams = int.tryParse(quantity.text);
    if (grams == null || grams <= 0 || floral.text.trim().isEmpty) return setState(() => error = 'Enter a positive whole-gram quantity and floral source.');
    await widget.onSave(hive, grams, floral.text.trim(), notes.text.trim());
    if (context.mounted) Navigator.pop(context);
  }, child: const Text('Sign and save'))]);
}

class _Brand extends StatelessWidget {
  const _Brand();
  @override
  Widget build(BuildContext context) => const Row(mainAxisSize: MainAxisSize.min, children: [Icon(Icons.hive_outlined, color: Color(0xffa76b00)), SizedBox(width: 8), Text('BHRAMARI', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 2, color: ink))]);
}
