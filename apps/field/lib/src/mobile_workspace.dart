import 'package:flutter/material.dart';

import 'api.dart';
import 'vault.dart';

class MobileWorkspace extends StatefulWidget {
  const MobileWorkspace({
    super.key,
    required this.api,
    required this.vault,
    required this.user,
    required this.hives,
    required this.lots,
    required this.requirements,
    required this.languages,
    required this.pending,
    required this.busy,
    required this.onRefresh,
    required this.onSync,
    required this.onLogout,
    required this.onQueueChanged,
    this.message,
  });
  final ApiClient api;
  final FieldVault vault;
  final Map<String, dynamic> user;
  final List<Map<String, dynamic>> hives, lots, requirements, languages;
  final int pending;
  final bool busy;
  final String? message;
  final Future<void> Function() onRefresh, onSync, onLogout, onQueueChanged;

  @override
  State<MobileWorkspace> createState() => _MobileWorkspaceState();
}

class _MobileWorkspaceState extends State<MobileWorkspace> {
  int page = 0;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text(
        'BHRAMARI',
        style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 2),
      ),
      actions: [
        IconButton(
          onPressed: widget.onLogout,
          tooltip: 'Sign out',
          icon: const Icon(Icons.logout),
        ),
      ],
    ),
    body: IndexedStack(
      index: page,
      children: [_field(), _vault(), _madhu(), _network()],
    ),
    bottomNavigationBar: NavigationBar(
      selectedIndex: page,
      onDestinationSelected: (value) => setState(() => page = value),
      destinations: const [
        NavigationDestination(icon: Icon(Icons.hive_outlined), label: 'Field'),
        NavigationDestination(
          icon: Icon(Icons.shield_outlined),
          label: 'Vault',
        ),
        NavigationDestination(icon: Icon(Icons.mic_none), label: 'Madhu'),
        NavigationDestination(
          icon: Icon(Icons.groups_outlined),
          label: 'Network',
        ),
      ],
    ),
  );

  Widget _field() => RefreshIndicator(
    onRefresh: widget.onRefresh,
    child: ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
          'Namaste, ${widget.user['name']}',
          style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
        ),
        Text(
          '${widget.user['role']} · ${widget.user['org_id']}',
          style: const TextStyle(color: Colors.black54),
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: widget.hives.isEmpty ? null : () => _harvest(),
                icon: const Icon(Icons.water_drop_outlined),
                label: const Text('Harvest'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: widget.hives.isEmpty ? null : () => _inspection(),
                icon: const Icon(Icons.fact_check_outlined),
                label: const Text('Inspect'),
              ),
            ),
          ],
        ),
        if (widget.message != null)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(
              widget.message!,
              style: const TextStyle(color: Color(0xff765000)),
            ),
          ),
        const _Section('Your hives'),
        ...widget.hives.map(
          (item) => _Card(
            icon: Icons.hexagon_outlined,
            title: item['name'],
            subtitle: '${item['region']} · ${item['floral']}',
            trailing: item['status'],
          ),
        ),
        const _Section('Honey and beeswax inventory'),
        ...widget.lots.map(
          (item) => _Card(
            icon: Icons.inventory_2_outlined,
            title: '${item['code']} · ${item['product']}',
            subtitle:
                '${_kg(item['available_g'])} available · ${item['floral']}',
            trailing: item['status'],
          ),
        ),
      ],
    ),
  );

  Widget _vault() => FutureBuilder<List<Map<String, dynamic>>>(
    future: widget.vault.queued(),
    builder: (context, snapshot) {
      final records = snapshot.data ?? [];
      return ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            'Encrypted offline vault',
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          const Text(
            'Every record is signed, sequenced, and chained before it leaves this phone.',
          ),
          const SizedBox(height: 18),
          FilledButton.icon(
            onPressed: widget.busy || records.isEmpty ? null : widget.onSync,
            icon: const Icon(Icons.sync),
            label: Text(
              'Sync ${records.length} record${records.length == 1 ? '' : 's'}',
            ),
          ),
          const _Section('Pending and disputed queue'),
          if (snapshot.connectionState == ConnectionState.waiting)
            const Center(child: CircularProgressIndicator()),
          if (records.isEmpty &&
              snapshot.connectionState != ConnectionState.waiting)
            const Text('The queue is clear.'),
          ...records.map(
            (item) => _Card(
              icon: Icons.lock_clock_outlined,
              title: item['event_type'],
              subtitle: item['occurred_at'],
              trailing: '#${item['device_sequence']}',
            ),
          ),
        ],
      );
    },
  );

  Widget _madhu() => MadhuPanel(
    api: widget.api,
    hives: widget.hives,
    languages: widget.languages,
  );

  Widget _network() => ListView(
    padding: const EdgeInsets.all(20),
    children: [
      const Text(
        'Hive network',
        style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800),
      ),
      const SizedBox(height: 8),
      Text(
        '${widget.languages.length} provider-discovered language choices are available for text and supported speech paths.',
      ),
      const _Section('Buyer demand'),
      if (widget.requirements.isEmpty)
        const Text('No open buyer requirements.'),
      ...widget.requirements.map(
        (item) => _Card(
          icon: Icons.handshake_outlined,
          title: '${item['product']} · ${_kg(item['quantity_g'])}',
          subtitle: '${item['region'] ?? 'Any region'} · ${item['packaging']}',
          trailing: item['status'],
        ),
      ),
      const _Section('Bee Circle'),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Ask a verified mentor',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17),
              ),
              const SizedBox(height: 6),
              const Text(
                'Questions and equipment requests stay tied to your organization and remain reviewable.',
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: widget.hives.isEmpty ? null : () => _mentor(),
                child: const Text('Request mentor'),
              ),
            ],
          ),
        ),
      ),
    ],
  );

  Future<void> _harvest() async {
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => CaptureDialog(hives: widget.hives, inspection: false),
    );
    if (result == null) return;
    await widget.vault.queueHarvest(
      user: widget.user,
      hiveId: result['hive'],
      quantityG: result['quantity'],
      floral: result['floral'],
      notes: result['notes'],
    );
    await widget.onQueueChanged();
  }

  Future<void> _inspection() async {
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => CaptureDialog(hives: widget.hives, inspection: true),
    );
    if (result == null) return;
    await widget.vault.queueInspection(
      user: widget.user,
      hiveId: result['hive'],
      observation: result['observation'],
      status: result['status'],
    );
    await widget.onQueueChanged();
  }

  Future<void> _mentor() async {
    final controller = TextEditingController();
    final question = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Request a mentor'),
        content: TextField(
          controller: controller,
          minLines: 2,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'What help do you need?',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Send request'),
          ),
        ],
      ),
    );
    if (question == null || question.length < 8) return;
    await widget.api.post('/circles/mentor-requests', {
      'hive_id': widget.hives.first['id'],
      'question': question,
    });
    if (mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Mentor request recorded.')));
    }
  }
}

class MadhuPanel extends StatefulWidget {
  const MadhuPanel({
    super.key,
    required this.api,
    required this.hives,
    required this.languages,
  });
  final ApiClient api;
  final List<Map<String, dynamic>> hives, languages;
  @override
  State<MadhuPanel> createState() => _MadhuPanelState();
}

class _MadhuPanelState extends State<MadhuPanel> {
  final message = TextEditingController();
  String language = 'en-IN';
  String? hive, answer, confirmation;
  bool busy = false;

  Future<void> send({bool confirm = false}) async {
    setState(() => busy = true);
    try {
      final result = await widget.api.post('/madhu/chat', {
        'message': message.text,
        'language': language,
        'context_id': hive,
        if (confirm) 'confirmation_id': confirmation,
      });
      setState(() {
        answer = result['answer']?.toString();
        confirmation = result['requires_confirmation'] == true
            ? result['confirmation_id']?.toString()
            : null;
      });
    } catch (failure) {
      setState(() => answer = failure.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(20),
    children: [
      const Text(
        'Madhu',
        style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800),
      ),
      const SizedBox(height: 6),
      const Text(
        'Role-aware guidance with explicit confirmation before operational changes.',
      ),
      const SizedBox(height: 18),
      DropdownButtonFormField<String>(
        initialValue: language,
        decoration: const InputDecoration(labelText: 'Language'),
        items: widget.languages.isEmpty
            ? [
                DropdownMenuItem(
                  value: language,
                  child: Text('$language · cached text mode'),
                ),
              ]
            : widget.languages
                  .map(
                    (item) => DropdownMenuItem(
                      value: item['code'] as String,
                      child: Text('${item['native_name']} · ${item['name']}'),
                    ),
                  )
                  .toList(),
        onChanged: (value) => setState(() => language = value!),
      ),
      const SizedBox(height: 12),
      DropdownButtonFormField<String?>(
        initialValue: hive,
        decoration: const InputDecoration(labelText: 'Hive context (optional)'),
        items: [
          const DropdownMenuItem(value: null, child: Text('No hive selected')),
          ...widget.hives.map(
            (item) => DropdownMenuItem(
              value: item['id'] as String,
              child: Text(item['name'] as String),
            ),
          ),
        ],
        onChanged: (value) => setState(() => hive = value),
      ),
      const SizedBox(height: 12),
      TextField(
        controller: message,
        onChanged: (_) => setState(() {}),
        minLines: 2,
        maxLines: 5,
        decoration: const InputDecoration(
          labelText: 'Ask or draft an action',
          hintText: 'Harvest 18 kg, check this hive, or request a mentor',
        ),
      ),
      const SizedBox(height: 12),
      FilledButton.icon(
        onPressed: busy || message.text.trim().isEmpty ? null : send,
        icon: const Icon(Icons.arrow_upward),
        label: Text(busy ? 'Working…' : 'Ask Madhu'),
      ),
      if (answer != null)
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(answer!),
                if (confirmation != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: FilledButton.tonal(
                      onPressed: busy ? null : () => send(confirm: true),
                      child: const Text('Confirm this action'),
                    ),
                  ),
              ],
            ),
          ),
        ),
    ],
  );
}

class CaptureDialog extends StatefulWidget {
  const CaptureDialog({
    super.key,
    required this.hives,
    required this.inspection,
  });
  final List<Map<String, dynamic>> hives;
  final bool inspection;
  @override
  State<CaptureDialog> createState() => _CaptureDialogState();
}

class _CaptureDialogState extends State<CaptureDialog> {
  late String hive = widget.hives.first['id'];
  final quantity = TextEditingController(),
      notes = TextEditingController(),
      floral = TextEditingController(text: 'Multiflora');
  String status = 'healthy';

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(widget.inspection ? 'Inspect hive' : 'Record harvest'),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          DropdownButtonFormField<String>(
            initialValue: hive,
            decoration: const InputDecoration(labelText: 'Hive'),
            items: widget.hives
                .map(
                  (item) => DropdownMenuItem(
                    value: item['id'] as String,
                    child: Text(item['name'] as String),
                  ),
                )
                .toList(),
            onChanged: (value) => hive = value!,
          ),
          const SizedBox(height: 12),
          if (widget.inspection) ...[
            DropdownButtonFormField<String>(
              initialValue: status,
              decoration: const InputDecoration(labelText: 'Status'),
              items: const [
                DropdownMenuItem(value: 'healthy', child: Text('Healthy')),
                DropdownMenuItem(
                  value: 'attention',
                  child: Text('Needs attention'),
                ),
                DropdownMenuItem(value: 'urgent', child: Text('Urgent')),
              ],
              onChanged: (value) => status = value!,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: notes,
              minLines: 2,
              maxLines: 4,
              decoration: const InputDecoration(labelText: 'Observation'),
            ),
          ] else ...[
            TextField(
              controller: quantity,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Quantity (grams)'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: floral,
              decoration: const InputDecoration(labelText: 'Floral source'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: notes,
              decoration: const InputDecoration(labelText: 'Notes'),
            ),
          ],
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      FilledButton(
        onPressed: () {
          if (widget.inspection) {
            if (notes.text.trim().length >= 3) {
              Navigator.pop(context, {
                'hive': hive,
                'observation': notes.text.trim(),
                'status': status,
              });
            }
          } else {
            final grams = int.tryParse(quantity.text);
            if (grams != null && grams > 0 && floral.text.trim().isNotEmpty) {
              Navigator.pop(context, {
                'hive': hive,
                'quantity': grams,
                'floral': floral.text.trim(),
                'notes': notes.text.trim(),
              });
            }
          }
        },
        child: const Text('Sign and save'),
      ),
    ],
  );
}

class _Section extends StatelessWidget {
  const _Section(this.title);
  final String title;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 28, bottom: 10),
    child: Text(
      title,
      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
    ),
  );
}

class _Card extends StatelessWidget {
  const _Card({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.trailing,
  });
  final IconData icon;
  final Object? title, subtitle, trailing;
  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      leading: CircleAvatar(
        backgroundColor: const Color(0xfffff0c7),
        child: Icon(icon, color: const Color(0xff9a6500)),
      ),
      title: Text('$title'),
      subtitle: Text('$subtitle'),
      trailing: Text('$trailing'),
    ),
  );
}

String _kg(Object? grams) =>
    '${((grams as num? ?? 0) / 1000).toStringAsFixed(1)} kg';
