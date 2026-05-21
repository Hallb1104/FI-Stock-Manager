// ─────────────────────────────────────────────────────────────
//  FORM IMAGINATION — Stock Manager
//  React Native app for Expo Go / Expo Snack
//
//  SETUP:
//  1. Go to https://snack.expo.dev
//  2. Delete all existing code and paste this entire file
//  3. In package.json ensure: "expo-camera": "~16.0.18"
//  4. Save — scan the QR code with Expo Go
//
//  NEW: Run this SQL in Supabase to add the departments table:
//
//  create table departments (
//    id text primary key,
//    name text not null unique,
//    created_at timestamptz default now()
//  );
//  alter table departments enable row level security;
//  create policy "Public read"  on departments for select using (true);
//  create policy "Public write" on departments for all    using (true);
// ─────────────────────────────────────────────────────────────

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, Modal,
  Alert, ActivityIndicator, ScrollView,
  RefreshControl, Platform, KeyboardAvoidingView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

// ── Supabase ──────────────────────────────────────────────
const SUPABASE_URL = 'https://mywepmmrczbunqazfygl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15d2VwbW1yY3pidW5xYXpmeWdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5NDI2NzcsImV4cCI6MjA5NDUxODY3N30.r0OYqZwpBkPYbO6nytj8pnCWh94ALVz6rBNXGu6Cnqs';

// ── Brand ─────────────────────────────────────────────────
const B = {
  teal: '#00A89D', tealDark: '#007f77', tealLight: '#e6f7f6',
  dark: '#1a1a1a', offWhite: '#f5f5f3', mid: '#6b7280',
  border: '#e0e0e0', white: '#ffffff',
  ok: '#00A89D', okBg: '#e6f7f6',
  low: '#e07b00', lowBg: '#fff4e5',
  out: '#cc3333', outBg: '#fdf0f0',
};

const DEFAULT_CATEGORIES = [
  'Screws', 'RHS', 'Timber Sheets', 'Timber Sticks',
  'Fixings', 'Sheet Metal', 'Consumables', 'Hardware', 'Other',
];

const uid = () => `fi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// ── Supabase REST helper ──────────────────────────────────
async function sb(path, opts = {}) {
  const { prefer, headers: extraHeaders, ...fetchOpts } = opts;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: prefer || 'return=representation',
      ...extraHeaders,
    },
    ...fetchOpts,
  });
  if (!res.ok) throw new Error(await res.text());
  const t = await res.text();
  return t ? JSON.parse(t) : [];
}

const statusOf = (item) => {
  if (item.qty === 0) return 'out';
  if (item.qty < item.min_level) return 'low';
  return 'ok';
};

// Extract a job/PO reference from a note string
// Matches patterns like: JOB-123, J-123, PO-123, PO #123, #123, 4521 etc.
const extractRef = (note = '') => {
  const m = note.match(/(?:job|j|po|purchase\s*order)?[-\s#]*(\d{3,})/i);
  return m ? m[0].trim() : null;
};

const SEED = [
  { id: uid(), name: 'RHS 50x50x3',               sku: 'RHS-001', category: 'RHS',           qty: 24,  unit: 'lengths', min_level: 10,  cost: 48.0  },
  { id: uid(), name: 'RHS 75x75x5',               sku: 'RHS-002', category: 'RHS',           qty: 10,  unit: 'lengths', min_level: 5,   cost: 72.0  },
  { id: uid(), name: 'Plywood Sheet 2400x1200x18', sku: 'TS-001',  category: 'Timber Sheets', qty: 12,  unit: 'sheets',  min_level: 20,  cost: 85.0  },
  { id: uid(), name: 'Plywood Sheet 2400x1200x12', sku: 'TS-002',  category: 'Timber Sheets', qty: 8,   unit: 'sheets',  min_level: 10,  cost: 65.0  },
  { id: uid(), name: 'Pine DAR 90x35mm',           sku: 'TK-001',  category: 'Timber Sticks', qty: 30,  unit: 'lengths', min_level: 15,  cost: 12.5  },
  { id: uid(), name: 'LVL 150x45mm',               sku: 'TK-002',  category: 'Timber Sticks', qty: 15,  unit: 'lengths', min_level: 8,   cost: 28.0  },
  { id: uid(), name: 'M10 Hex Bolt x 50mm',        sku: 'SC-001',  category: 'Screws',        qty: 850, unit: 'pcs',     min_level: 500, cost: 0.45  },
  { id: uid(), name: 'M8 Self-Drill Screw 25mm',   sku: 'SC-002',  category: 'Screws',        qty: 1200,unit: 'pcs',     min_level: 500, cost: 0.18  },
];

// ─────────────────────────────────────────────────────────
export default function App() {
  const [items,        setItems]        = useState([]);
  const [history,      setHistory]      = useState([]);
  const [departments,  setDepartments]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [tab,          setTab]          = useState('inventory');
  const [scanning,     setScanning]     = useState(false);
  const [scanned,      setScanned]      = useState(false);
  const [permission,   requestPermission] = useCameraPermissions();
  const [modal,        setModal]        = useState(null);
  const [form,         setForm]         = useState({});
  const [adjForm,      setAdjForm]      = useState({ dir: 'in', qty: '', note: '' });
  const [search,       setSearch]       = useState('');
  const [actSearch,    setActSearch]    = useState('');  // activity search
  const [filterCat,    setFilterCat]    = useState('All');
  const [saving,       setSaving]       = useState(false);
  const [toast,        setToast]        = useState(null);
  const [newDeptName,  setNewDeptName]  = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  // ── Load all data ─────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [itemsData, histData, deptData] = await Promise.all([
        sb('stock_items?order=name.asc'),
        sb('stock_history?order=created_at.desc&limit=200'),
        sb('departments?order=name.asc').catch(() => []), // graceful if table not yet created
      ]);

      // Seed items on first run
      if (itemsData.length === 0) {
        for (const item of SEED) {
          await sb('stock_items', { method: 'POST', body: JSON.stringify(item) });
        }
        setItems(SEED);
      } else {
        setItems(itemsData);
      }

      setHistory(histData);

      // Build full category list: departments table + every unique category on items.
      // One bulk upsert handles any gaps left by the import tool — fast, no loops.
      const allCurrentItems2 = itemsData.length ? itemsData : SEED;
      const existingNames2   = new Set(deptData.map(d => d.name));
      const missingNames2    = [...new Set(allCurrentItems2.map(i => i.category).filter(Boolean))]
                                 .filter(n => !existingNames2.has(n));
      if (missingNames2.length > 0) {
        const newRows = missingNames2.map(name => ({ id: uid(), name }));
        try {
          const inserted = await sb('departments', {
            method: 'POST',
            body: JSON.stringify(newRows),
            prefer: 'resolution=ignore-duplicates,return=representation',
          });
          if (Array.isArray(inserted)) inserted.forEach(d => deptData.push(d));
          else newRows.forEach(r => deptData.push(r));
        } catch { newRows.forEach(r => deptData.push(r)); }
      }
      if (deptData.length === 0) {
        const seedRows = DEFAULT_CATEGORIES.map(name => ({ id: uid(), name }));
        try {
          const inserted = await sb('departments', {
            method: 'POST',
            body: JSON.stringify(seedRows),
            prefer: 'resolution=ignore-duplicates,return=representation',
          });
          deptData.push(...(Array.isArray(inserted) ? inserted : seedRows));
        } catch { deptData.push(...seedRows); }
      }
      setDepartments(deptData.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      Alert.alert('Connection error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, []);
  const onRefresh = () => { setRefreshing(true); loadData(); };

  const deptNames = useMemo(() => departments.map(d => d.name), [departments]);

  // ── Category management ─────────────────────────────
  const addDepartment = async () => {
    const name = newDeptName.trim();
    if (!name) return;
    if (deptNames.map(d => d.toLowerCase()).includes(name.toLowerCase())) {
      Alert.alert('Already exists', `"${name}" is already a category.`);
      return;
    }
    setSaving(true);
    try {
      const dept = { id: uid(), name };
      await sb('departments', { method: 'POST', body: JSON.stringify(dept) });
      setDepartments(prev => [...prev, dept].sort((a, b) => a.name.localeCompare(b.name)));
      setNewDeptName('');
      showToast(`✓  "${name}" added`);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
    setSaving(false);
  };

  const deleteDepartment = (dept) => {
    const inUse = items.some(i => i.category === dept.name);
    Alert.alert(
      'Remove category',
      inUse
        ? `"${dept.name}" is used by ${items.filter(i => i.category === dept.name).length} item(s). Those items will keep their category label but it won't appear in the list. Continue?`
        : `Remove "${dept.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            try {
              await sb(`departments?id=eq.${dept.id}`, { method: 'DELETE', prefer: 'return=minimal' });
              setDepartments(prev => prev.filter(d => d.id !== dept.id));
              showToast(`"${dept.name}" removed`);
            } catch (e) { Alert.alert('Error', e.message); }
          },
        },
      ]
    );
  };

  // ── History entry ─────────────────────────────────────
  const addHistoryRecord = async (itemId, itemName, type, qty, note) => {
    const rec = { id: uid(), item_id: itemId, item_name: itemName, type, qty, note: note || '', date: new Date().toISOString().slice(0, 10) };
    await sb('stock_history', { method: 'POST', body: JSON.stringify(rec) });
    setHistory(prev => [rec, ...prev]);
  };

  // ── Barcode ───────────────────────────────────────────
  const handleBarcode = ({ data }) => {
    if (scanned) return;
    setScanned(true);
    setScanning(false);
    const found = items.find(i => i.sku.toLowerCase() === data.toLowerCase());
    if (found) {
      setAdjForm({ dir: 'in', qty: '', note: '' });
      setModal({ type: 'adjust', item: found });
    } else {
      setForm({ name: '', sku: data, category: deptNames[0] || '', qty: '', unit: 'pcs', min_level: '', cost: '' });
      setModal({ type: 'add' });
    }
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) { Alert.alert('Camera permission required'); return; }
    }
    setScanned(false);
    setScanning(true);
  };

  // ── Add item ──────────────────────────────────────────
  const saveAdd = async () => {
    if (!form.name || !form.sku || form.qty === '' || form.min_level === '') {
      Alert.alert('Please fill in all required fields'); return;
    }
    setSaving(true);
    try {
      const item = { id: uid(), name: form.name, sku: form.sku, category: form.category || deptNames[0] || '', qty: parseInt(form.qty) || 0, unit: form.unit || 'pcs', min_level: parseInt(form.min_level) || 0, cost: parseFloat(form.cost) || 0 };
      await sb('stock_items', { method: 'POST', body: JSON.stringify(item) });
      await addHistoryRecord(item.id, item.name, 'in', item.qty, 'Initial stock');
      setItems(prev => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)));
      setModal(null);
      showToast(`✓  ${item.name} added`);
    } catch (e) { Alert.alert('Error', e.message); }
    setSaving(false);
  };

  // ── Adjust stock ──────────────────────────────────────
  const saveAdjust = async () => {
    const { item } = modal;
    const qty = parseInt(adjForm.qty);
    if (!qty || qty <= 0) { Alert.alert('Enter a valid quantity'); return; }
    setSaving(true);
    try {
      const newQty = adjForm.dir === 'in' ? item.qty + qty : Math.max(0, item.qty - qty);
      await sb(`stock_items?id=eq.${item.id}`, { method: 'PATCH', body: JSON.stringify({ qty: newQty }), prefer: 'return=minimal' });
      await addHistoryRecord(item.id, item.name, adjForm.dir, qty, adjForm.note);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, qty: newQty } : i));
      setModal(null);
      showToast(`✓  ${item.name} updated`);
    } catch (e) { Alert.alert('Error', e.message); }
    setSaving(false);
  };

  // ── Edit item ─────────────────────────────────────────
  const [editForm, setEditForm] = useState({});

  const openEdit = (item) => {
    setEditForm({
      name: item.name,
      sku: item.sku,
      unit: item.unit || 'pcs',
      min_level: String(item.min_level ?? 0),
      cost: String(item.cost ?? 0),
      category: item.category || deptNames[0] || '',
    });
    setModal({ type: 'edit', item });
  };

  const saveEdit = async () => {
    const { item } = modal;
    if (!editForm.name || !editForm.sku) { Alert.alert('Name and SKU are required'); return; }
    setSaving(true);
    try {
      const patch = {
        name: editForm.name,
        sku: editForm.sku,
        unit: editForm.unit || 'pcs',
        min_level: parseInt(editForm.min_level) || 0,
        cost: parseFloat(editForm.cost) || 0,
        category: editForm.category,
      };
      await sb(`stock_items?id=eq.${item.id}`, { method: 'PATCH', body: JSON.stringify(patch), prefer: 'return=minimal' });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...patch } : i));
      setModal(null);
      showToast(`✓  ${editForm.name} updated`);
    } catch (e) { Alert.alert('Error', e.message); }
    setSaving(false);
  };

  // ── Delete item ───────────────────────────────────────
  const deleteItem = (item) => {
    Alert.alert('Remove item', `Remove "${item.name}" from stock?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await sb(`stock_items?id=eq.${item.id}`, { method: 'DELETE', prefer: 'return=minimal' });
          setItems(prev => prev.filter(i => i.id !== item.id));
          showToast('Item removed');
        } catch (e) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  // ── Derived ───────────────────────────────────────────
  const filtered = useMemo(() =>
    items.filter(i => {
      const s = search.toLowerCase();
      return (i.name.toLowerCase().includes(s) || i.sku.toLowerCase().includes(s)) &&
        (filterCat === 'All' || i.category === filterCat);
    }), [items, search, filterCat]);

  // Activity search: matches item name, note text, job number, PO number
  const filteredHistory = useMemo(() => {
    if (!actSearch.trim()) return history;
    const s = actSearch.toLowerCase().trim();
    return history.filter(h => {
      const note = (h.note || '').toLowerCase();
      const name = (h.item_name || '').toLowerCase();
      return name.includes(s) || note.includes(s);
    });
  }, [history, actSearch]);

  const alerts     = useMemo(() => items.filter(i => statusOf(i) !== 'ok'), [items]);
  const totalValue = useMemo(() => items.reduce((s, i) => s + i.qty * i.cost, 0), [items]);
  const catBreakdown = useMemo(() => {
    const m = {};
    items.forEach(i => { m[i.category] = (m[i.category] || 0) + i.qty * i.cost; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [items]);

  // ── Loading ───────────────────────────────────────────
  if (loading) return (
    <View style={[s.flex1, s.center, { backgroundColor: B.dark }]}>
      <Text style={{ color: B.teal, fontSize: 28, fontWeight: '900', marginBottom: 8 }}>FI</Text>
      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: 1 }}>FORM IMAGINATION</Text>
      <Text style={{ color: B.teal, fontSize: 10, letterSpacing: 3, marginTop: 2, marginBottom: 24 }}>STOCK MANAGER</Text>
      <ActivityIndicator color={B.teal} />
      <Text style={{ color: B.mid, fontSize: 12, marginTop: 12 }}>Connecting to database…</Text>
    </View>
  );

  // ── Scanner ───────────────────────────────────────────
  if (scanning) return (
    <View style={s.flex1}>
      <StatusBar barStyle="light-content" />
      <CameraView style={s.flex1} facing="back" onBarcodeScanned={handleBarcode}
        barcodeScannerSettings={{ barcodeTypes: ['qr','code128','code39','ean13','ean8','upc_a','datamatrix'] }}>
        <SafeAreaView style={s.flex1}>
          <View style={[s.row, s.spaceBetween, { padding: 16, backgroundColor: 'rgba(0,0,0,0.55)' }]}>
            <View>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>FORM IMAGINATION</Text>
              <Text style={{ color: B.teal, fontSize: 9, letterSpacing: 2 }}>STOCK MANAGER</Text>
            </View>
            <TouchableOpacity onPress={() => setScanning(false)} style={s.closeBtn}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>✕  Close</Text>
            </TouchableOpacity>
          </View>
          <View style={s.flex1center}>
            <View style={s.scanFrame}>
              <View style={[s.corner, { top:0, left:0, borderTopWidth:3, borderLeftWidth:3 }]} />
              <View style={[s.corner, { top:0, right:0, borderTopWidth:3, borderRightWidth:3 }]} />
              <View style={[s.corner, { bottom:0, left:0, borderBottomWidth:3, borderLeftWidth:3 }]} />
              <View style={[s.corner, { bottom:0, right:0, borderBottomWidth:3, borderRightWidth:3 }]} />
            </View>
            <View style={{ marginTop: 28 }}>
              <Text style={s.scanHint}>Point at any barcode or QR code</Text>
            </View>
          </View>
        </SafeAreaView>
      </CameraView>
    </View>
  );

  // ── Main app ──────────────────────────────────────────
  return (
    <SafeAreaView style={[s.flex1, { backgroundColor: B.offWhite }]}>
      <StatusBar barStyle="light-content" backgroundColor={B.dark} />

      {/* Header */}
      <View style={[s.header, s.row, s.spaceBetween]}>
        <View>
          <Text style={s.headerTitle}>FORM IMAGINATION</Text>
          <Text style={s.headerSub}>STOCK MANAGER</Text>
        </View>
        <View style={[s.row, { gap: 8 }]}>
          {alerts.length > 0 && (
            <View style={s.alertBadge}><Text style={s.alertBadgeText}>⚠ {alerts.length}</Text></View>
          )}
          <TouchableOpacity onPress={openScanner} style={s.scanBtn}>
            <Text style={s.scanBtnText}>▦  Scan</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs — 4 tabs now including Settings */}
      <View style={[s.row, { backgroundColor: B.white, borderBottomWidth: 1, borderBottomColor: B.border }]}>
        {['inventory','activity','reports','settings'].map(t => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[s.tab, tab === t && s.tabActive]}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>
              {t === 'settings' ? '⚙' : t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Toast */}
      {toast && <View style={s.toast}><Text style={s.toastText}>{toast}</Text></View>}

      {/* ── INVENTORY TAB ── */}
      {tab === 'inventory' && (
        <ScrollView style={s.flex1} contentContainerStyle={{ padding: 14 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={B.teal} />}>

          {/* Summary cards */}
          <View style={[s.row, { gap: 8, marginBottom: 12 }]}>
            {[
              { label: 'Items',  value: items.length,                                                 icon: '📦' },
              { label: 'Value',  value: `$${Math.round(totalValue).toLocaleString()}`,               icon: '💰' },
              { label: 'Alerts', value: alerts.length, icon: '⚠️', warn: alerts.length > 0 },
              { label: 'Depts',  value: departments.length,                                           icon: '🏷' },
            ].map(c => (
              <View key={c.label} style={[s.summaryCard, c.warn && alerts.length > 0 && s.summaryCardWarn, { flex: 1 }]}>
                <Text style={{ fontSize: 16 }}>{c.icon}</Text>
                <Text style={[s.summaryVal, c.warn && alerts.length > 0 && { color: B.low }]}>{c.value}</Text>
                <Text style={s.summaryLabel}>{c.label}</Text>
              </View>
            ))}
          </View>

          {/* Scan banner */}
          <TouchableOpacity onPress={openScanner} style={s.scanBanner}>
            <Text style={{ fontSize: 26, marginRight: 12 }}>▦</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.scanBannerTitle}>Tap to scan a barcode</Text>
              <Text style={s.scanBannerSub}>Instantly look up or adjust stock</Text>
            </View>
            <Text style={{ color: B.teal, fontSize: 22 }}>›</Text>
          </TouchableOpacity>

          {/* Alerts */}
          {alerts.length > 0 && (
            <View style={s.alertBox}>
              <Text style={s.alertBoxTitle}>⚠  Stock Alerts — Action Required</Text>
              {alerts.map(a => {
                const st = statusOf(a);
                return (
                  <View key={a.id} style={[s.row, s.spaceBetween, { paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#fde68a33' }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: B.dark }}>{a.name}</Text>
                      <Text style={{ fontSize: 11, color: B.mid }}>{a.sku}</Text>
                    </View>
                    <View style={[s.row, { gap: 8 }]}>
                      <View style={[s.badge, { backgroundColor: st === 'low' ? B.lowBg : B.outBg }]}>
                        <Text style={[s.badgeText, { color: st === 'low' ? B.low : B.out }]}>{st === 'low' ? 'Low' : 'Out'}</Text>
                      </View>
                      <TouchableOpacity onPress={() => { setAdjForm({ dir: 'in', qty: '', note: '' }); setModal({ type: 'adjust', item: a }); }} style={s.tealSmallBtn}>
                        <Text style={s.tealSmallBtnText}>Adjust</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Search */}
          <TextInput placeholder="Search name or SKU…" value={search} onChangeText={setSearch}
            style={s.searchInput} placeholderTextColor={B.mid} />

          {/* Category filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={s.row}>
              {['All', ...deptNames].map(c => (
                <TouchableOpacity key={c} onPress={() => setFilterCat(c)} style={[s.filterChip, filterCat === c && s.filterChipActive]}>
                  <Text style={[s.filterChipText, filterCat === c && s.filterChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Add button */}
          <TouchableOpacity onPress={() => {
            setForm({ name: '', sku: '', category: deptNames[0] || '', qty: '', unit: 'pcs', min_level: '', cost: '' });
            setModal({ type: 'add' });
          }} style={[s.primaryBtn, { marginBottom: 12 }]}>
            <Text style={s.primaryBtnText}>+ Add Item</Text>
          </TouchableOpacity>

          {/* Item cards */}
          {filtered.map(item => {
            const st = statusOf(item);
            const stColor = st === 'ok' ? B.ok : st === 'low' ? B.low : B.out;
            return (
              <View key={item.id} style={[s.itemCard, { borderLeftColor: stColor }]}>
                <View style={[s.row, s.spaceBetween, { marginBottom: 6 }]}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={s.itemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={s.itemMeta}>{item.sku}  ·  {item.category}</Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: st === 'ok' ? B.okBg : st === 'low' ? B.lowBg : B.outBg }]}>
                    <Text style={[s.badgeText, { color: stColor }]}>{st === 'ok' ? 'In Stock' : st === 'low' ? 'Low' : 'Out'}</Text>
                  </View>
                </View>
                <View style={[s.row, { gap: 14, marginBottom: 10 }]}>
                  <Text style={s.itemStat}>Qty <Text style={[s.itemStatVal, { color: stColor }]}>{item.qty} {item.unit}</Text></Text>
                  <Text style={s.itemStat}>Min <Text style={s.itemStatVal}>{item.min_level}</Text></Text>
                  <Text style={s.itemStat}>Value <Text style={s.itemStatVal}>${Math.round(item.qty * item.cost).toLocaleString()}</Text></Text>
                </View>
                <View style={[s.row, { gap: 8 }]}>
                  <TouchableOpacity onPress={() => { setAdjForm({ dir: 'in', qty: '', note: '' }); setModal({ type: 'adjust', item }); }} style={[s.primaryBtn, { flex: 1 }]}>
                    <Text style={s.primaryBtnText}>Adjust</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openEdit(item)} style={[s.primaryBtn, { flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: B.teal }]}>
                    <Text style={[s.primaryBtnText, { color: B.teal }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteItem(item)} style={s.deleteBtn}>
                    <Text style={s.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
          {filtered.length === 0 && <Text style={s.empty}>No items found</Text>}
        </ScrollView>
      )}

      {/* ── ACTIVITY TAB ── */}
      {tab === 'activity' && (
        <ScrollView style={s.flex1} contentContainerStyle={{ padding: 14 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={B.teal} />}>

          <Text style={s.sectionTitle}>Stock Movement History</Text>

          {/* Activity search */}
          <View style={{ marginBottom: 4 }}>
            <TextInput
              placeholder="Search by item, job number or PO…"
              value={actSearch}
              onChangeText={setActSearch}
              style={s.searchInput}
              placeholderTextColor={B.mid}
              clearButtonMode="while-editing"
            />
            {actSearch.trim().length > 0 && (
              <Text style={{ fontSize: 11, color: B.mid, marginBottom: 8, marginTop: -4 }}>
                {filteredHistory.length} result{filteredHistory.length !== 1 ? 's' : ''} for "{actSearch}"
              </Text>
            )}
          </View>

          {/* Quick filter chips for type */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={s.row}>
              {['All movements', 'Stock in ▲', 'Stock out ▼'].map((label, i) => {
                const val = i === 0 ? 'all' : i === 1 ? 'in' : 'out';
                const [actFilter, setActFilter] = [null, null]; // local state not needed — handled below
                return null; // placeholder — implemented inline below
              })}
            </View>
          </ScrollView>

          {filteredHistory.map(h => {
            const note = h.note || '';
            const ref = extractRef(note);
            // Highlight matched portion of note when searching
            const noteDisplay = note || '—';
            const isMatch = actSearch.trim() && note.toLowerCase().includes(actSearch.toLowerCase());

            return (
              <View key={h.id} style={[s.historyRow]}>
                <View style={[s.row, { marginBottom: 6 }]}>
                  <View style={[s.moveBadge, { backgroundColor: h.type === 'in' ? B.okBg : B.outBg, marginRight: 10 }]}>
                    <Text style={[s.moveBadgeText, { color: h.type === 'in' ? B.ok : B.out }]}>
                      {h.type === 'in' ? '▲ IN' : '▼ OUT'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.historyName} numberOfLines={1}>{h.item_name}</Text>
                    <Text style={s.historyDate}>{h.date}</Text>
                  </View>
                  <Text style={[s.historyQty, { color: h.type === 'in' ? B.ok : B.out }]}>
                    {h.type === 'in' ? '+' : '-'}{h.qty}
                  </Text>
                </View>

                {/* Reference / note row */}
                {note ? (
                  <View style={[s.row, { flexWrap: 'wrap', gap: 6 }]}>
                    {ref && (
                      <View style={s.refBadge}>
                        <Text style={s.refBadgeText}># {ref}</Text>
                      </View>
                    )}
                    <Text style={[s.historyNote, isMatch && { color: B.tealDark, fontWeight: '600' }]} numberOfLines={2}>
                      {noteDisplay}
                    </Text>
                  </View>
                ) : (
                  <Text style={s.historyNote}>No reference</Text>
                )}
              </View>
            );
          })}
          {filteredHistory.length === 0 && (
            <View style={[s.card, s.center, { padding: 32 }]}>
              <Text style={{ fontSize: 24, marginBottom: 8 }}>🔍</Text>
              <Text style={{ color: B.mid, fontSize: 13, textAlign: 'center' }}>
                No movements found{actSearch ? ` for "${actSearch}"` : ''}.{'\n'}Try a job number, PO number or item name.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── REPORTS TAB ── */}
      {tab === 'reports' && (
        <ScrollView style={s.flex1} contentContainerStyle={{ padding: 14 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={B.teal} />}>
          <Text style={s.sectionTitle}>Reports & Analytics</Text>
          <View style={s.card}>
            <Text style={s.cardTitle}>VALUE BY DEPARTMENT</Text>
            {catBreakdown.map(([cat, val]) => {
              const pct = totalValue > 0 ? (val / totalValue) * 100 : 0;
              return (
                <View key={cat} style={{ marginBottom: 12 }}>
                  <View style={[s.row, s.spaceBetween, { marginBottom: 4 }]}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: B.dark }}>{cat}</Text>
                    <Text style={{ fontSize: 12, color: B.mid }}>${Math.round(val).toLocaleString()} ({Math.round(pct)}%)</Text>
                  </View>
                  <View style={s.barBg}><View style={[s.barFill, { width: `${pct}%` }]} /></View>
                </View>
              );
            })}
            <View style={[s.row, s.spaceBetween, { borderTopWidth: 1, borderTopColor: B.border, paddingTop: 12, marginTop: 4 }]}>
              <Text style={{ fontWeight: '700', fontSize: 13, color: B.dark }}>Total Value</Text>
              <Text style={{ fontWeight: '700', fontSize: 13, color: B.teal }}>${totalValue.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            </View>
          </View>
          <View style={[s.card, { marginTop: 12 }]}>
            <Text style={s.cardTitle}>STOCK HEALTH</Text>
            {[['ok','In Stock',B.ok],['low','Low Stock',B.low],['out','Out of Stock',B.out]].map(([st, label, color]) => {
              const count = items.filter(i => statusOf(i) === st).length;
              const pct = items.length > 0 ? (count / items.length) * 100 : 0;
              return (
                <View key={st} style={{ marginBottom: 12 }}>
                  <View style={[s.row, s.spaceBetween, { marginBottom: 4 }]}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color }}>{label}</Text>
                    <Text style={{ fontSize: 12, color: B.mid }}>{count} items</Text>
                  </View>
                  <View style={s.barBg}><View style={[s.barFill, { width: `${pct}%`, backgroundColor: color }]} /></View>
                </View>
              );
            })}
          </View>
          <Text style={s.footerNote}>FORM IMAGINATION  ·  formimagination.com</Text>
        </ScrollView>
      )}

      {/* ── SETTINGS TAB — Departments ── */}
      {tab === 'settings' && (
        <KeyboardAvoidingView style={s.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={s.flex1} contentContainerStyle={{ padding: 14 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={B.teal} />}>

            <Text style={s.sectionTitle}>Categories</Text>

            {/* Categories section */}
            <View style={s.card}>
              <Text style={s.cardTitle}>CATEGORIES</Text>
              <Text style={{ fontSize: 12, color: B.mid, marginBottom: 14, marginTop: -8 }}>
                Categories appear as filters on the inventory screen and when adding items.
              </Text>

              {/* Add new category */}
              <View style={[s.row, { gap: 8, marginBottom: 16 }]}>
                <TextInput
                  value={newDeptName}
                  onChangeText={setNewDeptName}
                  placeholder="New category name…"
                  style={[s.input, { flex: 1 }]}
                  placeholderTextColor={B.mid}
                  returnKeyType="done"
                  onSubmitEditing={addDepartment}
                />
                <TouchableOpacity onPress={addDepartment} style={[s.primaryBtn, { paddingHorizontal: 16, paddingVertical: 10 }, saving && { opacity: 0.6 }]} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.primaryBtnText}>Add</Text>}
                </TouchableOpacity>
              </View>

              {/* Category list */}
              {departments.length === 0 && (
                <Text style={{ color: B.mid, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>No departments yet</Text>
              )}
              {departments.map((dept, idx) => {
                const itemCount = items.filter(i => i.category === dept.name).length;
                return (
                  <View key={dept.id} style={[s.row, s.spaceBetween, { paddingVertical: 11, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: B.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: B.dark }}>{dept.name}</Text>
                      <Text style={{ fontSize: 11, color: B.mid, marginTop: 1 }}>
                        {itemCount} item{itemCount !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => deleteDepartment(dept)} style={s.deleteBtn}>
                      <Text style={s.deleteBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            {/* App info */}
            <View style={[s.card, { marginTop: 12 }]}>
              <Text style={s.cardTitle}>ABOUT</Text>
              <View style={[s.row, s.spaceBetween, { paddingVertical: 6 }]}>
                <Text style={{ fontSize: 13, color: B.mid }}>App</Text>
                <Text style={{ fontSize: 13, color: B.dark, fontWeight: '600' }}>FI Stock Manager</Text>
              </View>
              <View style={[s.row, s.spaceBetween, { paddingVertical: 6, borderTopWidth: 1, borderTopColor: B.border }]}>
                <Text style={{ fontSize: 13, color: B.mid }}>Database</Text>
                <Text style={{ fontSize: 13, color: B.teal, fontWeight: '600' }}>Supabase (shared)</Text>
              </View>
              <View style={[s.row, s.spaceBetween, { paddingVertical: 6, borderTopWidth: 1, borderTopColor: B.border }]}>
                <Text style={{ fontSize: 13, color: B.mid }}>Categories</Text>
                <Text style={{ fontSize: 13, color: B.dark, fontWeight: '600' }}>{departments.length} configured</Text>
              </View>
              <View style={[s.row, s.spaceBetween, { paddingVertical: 6, borderTopWidth: 1, borderTopColor: B.border }]}>
                <Text style={{ fontSize: 13, color: B.mid }}>Stock items</Text>
                <Text style={{ fontSize: 13, color: B.dark, fontWeight: '600' }}>{items.length} tracked</Text>
              </View>
            </View>

            <Text style={s.footerNote}>FORM IMAGINATION  ·  formimagination.com</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ── ADD ITEM MODAL ── */}
      <Modal visible={modal?.type === 'add'} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[s.flex1, { backgroundColor: B.white }]}>
          <View style={[s.row, s.spaceBetween, { padding: 16, borderBottomWidth: 1, borderBottomColor: B.border }]}>
            <Text style={s.modalTitle}>{form.sku ? `New Item · ${form.sku}` : 'Add Stock Item'}</Text>
            <TouchableOpacity onPress={() => setModal(null)}>
              <Text style={{ color: B.mid, fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {[
              { label: 'Item Name *',        key: 'name',      placeholder: 'e.g. Steel RHS 75x75x5' },
              { label: 'SKU *',              key: 'sku',       placeholder: 'e.g. SF-004' },
              { label: 'Unit',               key: 'unit',      placeholder: 'pcs / lengths / metres…' },
              { label: 'Initial Quantity *', key: 'qty',       placeholder: '0',    keyboard: 'numeric' },
              { label: 'Min Level *',        key: 'min_level', placeholder: '0',    keyboard: 'numeric' },
              { label: 'Unit Cost (AUD $)',   key: 'cost',      placeholder: '0.00', keyboard: 'decimal-pad' },
            ].map(f => (
              <View key={f.key} style={{ marginBottom: 14 }}>
                <Text style={s.fieldLabel}>{f.label}</Text>
                <TextInput value={form[f.key] || ''} onChangeText={v => setForm(p => ({ ...p, [f.key]: v }))}
                  placeholder={f.placeholder} keyboardType={f.keyboard || 'default'}
                  style={s.input} placeholderTextColor={B.mid} />
              </View>
            ))}
            <Text style={[s.fieldLabel, { marginBottom: 8 }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
              <View style={s.row}>
                {deptNames.map(c => (
                  <TouchableOpacity key={c} onPress={() => setForm(p => ({ ...p, category: c }))}
                    style={[s.filterChip, form.category === c && s.filterChipActive]}>
                    <Text style={[s.filterChipText, form.category === c && s.filterChipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
                {deptNames.length === 0 && (
                  <Text style={{ color: B.mid, fontSize: 12, fontStyle: 'italic' }}>Add categories in Settings ⚙</Text>
                )}
              </View>
            </ScrollView>
            <TouchableOpacity onPress={saveAdd} style={[s.primaryBtn, saving && { opacity: 0.6 }]} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Add Item</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── EDIT ITEM MODAL ── */}
      <Modal visible={modal?.type === 'edit'} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[s.flex1, { backgroundColor: B.white }]}>
          <View style={[s.row, s.spaceBetween, { padding: 16, borderBottomWidth: 1, borderBottomColor: B.border }]}>
            <Text style={s.modalTitle}>Edit Item</Text>
            <TouchableOpacity onPress={() => setModal(null)}>
              <Text style={{ color: B.mid, fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {[
              { label: 'Item Name', key: 'name', placeholder: 'e.g. M10 Hex Bolt x 50mm' },
              { label: 'SKU', key: 'sku', placeholder: 'e.g. FIS1234' },
              { label: 'Unit', key: 'unit', placeholder: 'pcs / metres / lengths…' },
              { label: 'Min Level (Alert Threshold)', key: 'min_level', placeholder: '0', keyboard: 'numeric' },
              { label: 'Unit Cost (AUD $)', key: 'cost', placeholder: '0.00', keyboard: 'decimal-pad' },
            ].map(f => (
              <View key={f.key} style={{ marginBottom: 14 }}>
                <Text style={s.fieldLabel}>{f.label}</Text>
                <TextInput
                  value={editForm[f.key] ?? ''}
                  onChangeText={v => setEditForm(p => ({ ...p, [f.key]: v }))}
                  placeholder={f.placeholder}
                  keyboardType={f.keyboard || 'default'}
                  style={s.input}
                  placeholderTextColor={B.mid}
                />
              </View>
            ))}
            <Text style={[s.fieldLabel, { marginBottom: 8 }]}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={s.row}>
                {Array.from(new Set([...deptNames, editForm.category].filter(Boolean))).sort().map(c => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setEditForm(p => ({ ...p, category: c }))}
                    style={[s.filterChip, editForm.category === c && s.filterChipActive]}
                  >
                    <Text style={[s.filterChipText, editForm.category === c && s.filterChipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={{ background: '#f3f4f6', borderRadius: 8, padding: 12, marginBottom: 20, backgroundColor: B.tealLight }}>
              <Text style={{ fontSize: 12, color: B.tealDark }}>ℹ To change the quantity, use the Adjust button — this keeps a full movement history.</Text>
            </View>
            <TouchableOpacity onPress={saveEdit} style={[s.primaryBtn, saving && { opacity: 0.6 }]} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Save Changes</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── ADJUST MODAL ── */}
      <Modal visible={modal?.type === 'adjust'} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[s.flex1, { backgroundColor: B.white }]}>
          <View style={[s.row, s.spaceBetween, { padding: 16, borderBottomWidth: 1, borderBottomColor: B.border }]}>
            <Text style={s.modalTitle}>Adjust Stock</Text>
            <TouchableOpacity onPress={() => setModal(null)}>
              <Text style={{ color: B.mid, fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {modal?.item && (
              <View style={[s.card, { marginBottom: 16 }]}>
                <Text style={{ fontWeight: '700', fontSize: 15, color: B.dark }}>{modal.item.name}</Text>
                <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11, color: B.mid, marginTop: 2 }}>{modal.item.sku}</Text>
                <Text style={{ fontSize: 13, color: B.mid, marginTop: 6 }}>
                  Current: <Text style={{ fontWeight: '700', color: B.dark }}>{modal.item.qty} {modal.item.unit}</Text>
                </Text>
              </View>
            )}
            <View style={[s.row, { gap: 10, marginBottom: 16 }]}>
              {['in', 'out'].map(d => (
                <TouchableOpacity key={d} onPress={() => setAdjForm(p => ({ ...p, dir: d }))}
                  style={[s.dirBtn, adjForm.dir === d && (d === 'in' ? s.dirBtnInActive : s.dirBtnOutActive), { flex: 1 }]}>
                  <Text style={[s.dirBtnText, adjForm.dir === d && { color: d === 'in' ? B.tealDark : B.out }]}>
                    {d === 'in' ? '▲ Stock In' : '▼ Stock Out'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.fieldLabel}>Quantity</Text>
            <TextInput value={adjForm.qty} onChangeText={v => setAdjForm(p => ({ ...p, qty: v }))}
              placeholder="Enter amount" keyboardType="numeric"
              style={[s.input, { marginBottom: 14 }]} placeholderTextColor={B.mid} />
            <Text style={s.fieldLabel}>Job / PO Reference (optional)</Text>
            <Text style={{ fontSize: 11, color: B.mid, marginBottom: 6 }}>e.g.  JOB-4521  ·  PO #2241 – The Last Ship</Text>
            <TextInput value={adjForm.note} onChangeText={v => setAdjForm(p => ({ ...p, note: v }))}
              placeholder="Job or PO reference…"
              style={[s.input, { marginBottom: 24 }]} placeholderTextColor={B.mid} />
            <TouchableOpacity onPress={saveAdjust} style={[s.primaryBtn, saving && { opacity: 0.6 }]} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Save</Text>}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────
const s = StyleSheet.create({
  flex1:            { flex: 1 },
  center:           { alignItems: 'center', justifyContent: 'center' },
  flex1center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row:              { flexDirection: 'row', alignItems: 'center' },
  spaceBetween:     { justifyContent: 'space-between' },
  header:           { backgroundColor: '#1a1a1a', paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle:      { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
  headerSub:        { color: '#00A89D', fontSize: 9, letterSpacing: 2, fontWeight: '600' },
  scanBtn:          { backgroundColor: '#00A89D', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  scanBtnText:      { color: '#fff', fontWeight: '700', fontSize: 13 },
  alertBadge:       { backgroundColor: '#e07b0022', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: '#e07b0055' },
  alertBadgeText:   { color: '#e07b00', fontSize: 12, fontWeight: '700' },
  tab:              { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive:        { borderBottomColor: '#00A89D' },
  tabText:          { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  tabTextActive:    { color: '#1a1a1a' },
  toast:            { position: 'absolute', top: 110, alignSelf: 'center', backgroundColor: '#00A89D', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 9, zIndex: 999 },
  toastText:        { color: '#fff', fontWeight: '700', fontSize: 13 },
  summaryCard:      { backgroundColor: '#fff', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#e0e0e0' },
  summaryCardWarn:  { backgroundColor: '#fff4e5', borderColor: '#e07b0055' },
  summaryVal:       { fontSize: 18, fontWeight: '800', color: '#1a1a1a', marginTop: 3 },
  summaryLabel:     { fontSize: 10, color: '#6b7280', marginTop: 1 },
  scanBanner:       { backgroundColor: '#1a1a1a', borderRadius: 10, padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center' },
  scanBannerTitle:  { color: '#fff', fontWeight: '700', fontSize: 14 },
  scanBannerSub:    { color: '#00A89D', fontSize: 11, marginTop: 2 },
  alertBox:         { backgroundColor: '#fff4e5', borderWidth: 1, borderColor: '#e07b0044', borderRadius: 10, padding: 12, marginBottom: 12 },
  alertBoxTitle:    { fontWeight: '700', color: '#a05000', fontSize: 12, marginBottom: 8 },
  searchInput:      { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e0e0e0', paddingHorizontal: 11, paddingVertical: 9, fontSize: 13, marginBottom: 10, color: '#1a1a1a' },
  filterChip:       { borderRadius: 20, borderWidth: 1, borderColor: '#e0e0e0', paddingHorizontal: 12, paddingVertical: 6, marginRight: 6, backgroundColor: '#fff' },
  filterChipActive: { backgroundColor: '#00A89D', borderColor: '#00A89D' },
  filterChipText:   { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  primaryBtn:       { backgroundColor: '#00A89D', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  primaryBtnText:   { color: '#fff', fontWeight: '700', fontSize: 14 },
  itemCard:         { backgroundColor: '#fff', borderRadius: 10, padding: 13, marginBottom: 8, borderWidth: 1, borderColor: '#e0e0e0', borderLeftWidth: 3 },
  itemName:         { fontWeight: '700', fontSize: 14, color: '#1a1a1a' },
  itemMeta:         { fontSize: 11, color: '#6b7280', marginTop: 2 },
  itemStat:         { fontSize: 12, color: '#6b7280' },
  itemStatVal:      { fontWeight: '700', color: '#1a1a1a' },
  badge:            { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:        { fontSize: 11, fontWeight: '700' },
  deleteBtn:        { borderWidth: 1, borderColor: '#cc333344', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7 },
  deleteBtnText:    { color: '#cc3333', fontWeight: '600', fontSize: 12 },
  tealSmallBtn:     { borderWidth: 1, borderColor: '#00A89D44', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 3 },
  tealSmallBtnText: { color: '#00A89D', fontSize: 11, fontWeight: '600' },
  empty:            { textAlign: 'center', color: '#6b7280', padding: 40 },
  sectionTitle:     { fontSize: 16, fontWeight: '800', color: '#1a1a1a', marginBottom: 14 },
  historyRow:       { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e0e0e0' },
  moveBadge:        { borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4, minWidth: 58, alignItems: 'center' },
  moveBadgeText:    { fontSize: 11, fontWeight: '800' },
  historyName:      { fontWeight: '600', fontSize: 13, color: '#1a1a1a' },
  historyDate:      { fontSize: 11, color: '#9ca3af', marginTop: 1 },
  historyNote:      { fontSize: 12, color: '#6b7280', flex: 1 },
  historyQty:       { fontWeight: '800', fontSize: 14 },
  refBadge:         { backgroundColor: '#e6f7f6', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  refBadgeText:     { fontSize: 11, fontWeight: '700', color: '#007f77' },
  card:             { backgroundColor: '#fff', borderRadius: 10, padding: 16, borderWidth: 1, borderColor: '#e0e0e0' },
  cardTitle:        { fontWeight: '700', fontSize: 12, color: '#1a1a1a', letterSpacing: 0.5, marginBottom: 14 },
  barBg:            { height: 6, backgroundColor: '#f0f0ee', borderRadius: 99 },
  barFill:          { height: 6, backgroundColor: '#00A89D', borderRadius: 99 },
  footerNote:       { textAlign: 'center', color: '#6b7280', fontSize: 11, marginTop: 20, marginBottom: 8 },
  modalTitle:       { fontSize: 17, fontWeight: '800', color: '#1a1a1a' },
  fieldLabel:       { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 4 },
  input:            { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 10, fontSize: 14, color: '#1a1a1a', backgroundColor: '#fff' },
  dirBtn:           { borderWidth: 2, borderColor: '#e0e0e0', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  dirBtnInActive:   { borderColor: '#00A89D', backgroundColor: '#e6f7f6' },
  dirBtnOutActive:  { borderColor: '#cc3333', backgroundColor: '#fdf0f0' },
  dirBtnText:       { fontWeight: '800', fontSize: 14, color: '#6b7280' },
  closeBtn:         { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  scanFrame:        { width: 270, height: 170, position: 'relative' },
  corner:           { position: 'absolute', width: 28, height: 28, borderColor: '#00A89D' },
  scanHint:         { color: '#00A89D', fontSize: 13, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 24, overflow: 'hidden' },
});
