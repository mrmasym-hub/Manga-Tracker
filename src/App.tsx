import React, { useState, useEffect } from 'react';
import { auth, googleProvider, db, OperationType, handleFirestoreError } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, onSnapshot, orderBy, Timestamp, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { Plus, LogOut, BookOpen, ExternalLink, Trash2, RefreshCw, ChevronRight, Loader2, Edit2, Languages } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const translations = {
  en: {
    title: "Manga Tracker",
    subtitle: "Keep track of your reading progress across all your favorite manga sites.",
    signIn: "Sign in with Google",
    totalManga: "Total Manga",
    chaptersRead: "Chapters Read",
    completed: "Completed",
    addManga: "Add Manga",
    logout: "Logout",
    progress: "Progress",
    readNext: "Read Next",
    lastUpdated: "Last Updated",
    noManga: "No manga tracked yet",
    startAdding: "Start by adding your favorite manga URL.",
    addFirst: "Add Your First Manga",
    addNew: "Add New Manga",
    editManga: "Edit Manga",
    mangaUrl: "Manga URL",
    currentChapter: "Current Chapter",
    mangaTitle: "Manga Title",
    imageUrl: "Image URL",
    cancel: "Cancel",
    delete: "Delete",
    deleteConfirmTitle: "Delete Manga?",
    deleteConfirmText: "Are you sure you want to remove this manga from your list? This action cannot be undone.",
    saveChanges: "Save Changes",
    failedToAdd: "Failed to add manga. Please check the URL.",
    unknown: "Unknown",
    unknownManga: "Unknown Manga"
  },
  th: {
    title: "Manga Tracker",
    subtitle: "ติดตามความคืบหน้าการอ่านมังงะของคุณจากทุกเว็บไซต์ที่คุณชื่นชอบ",
    signIn: "เข้าสู่ระบบด้วย Google",
    totalManga: "มังงะทั้งหมด",
    chaptersRead: "ตอนที่อ่านแล้ว",
    completed: "อ่านจบแล้ว",
    addManga: "เพิ่มมังงะ",
    logout: "ออกจากระบบ",
    progress: "ความคืบหน้า",
    readNext: "อ่านต่อ",
    lastUpdated: "อัปเดตล่าสุด",
    noManga: "ยังไม่มีมังงะที่ติดตาม",
    startAdding: "เริ่มต้นด้วยการเพิ่ม URL มังงะที่คุณชื่นชอบ",
    addFirst: "เพิ่มมังงะเรื่องแรก",
    addNew: "เพิ่มมังงะใหม่",
    editManga: "แก้ไขมังงะ",
    mangaUrl: "URL มังงะ",
    currentChapter: "ตอนปัจจุบัน",
    mangaTitle: "ชื่อมังงะ",
    imageUrl: "URL รูปภาพ",
    cancel: "ยกเลิก",
    delete: "ลบ",
    deleteConfirmTitle: "ลบมังงะ?",
    deleteConfirmText: "คุณแน่ใจหรือไม่ว่าต้องการลบมังงะเรื่องนี้ออกจากรายการของคุณ? การดำเนินการนี้ไม่สามารถย้อนกลับได้",
    saveChanges: "บันทึกการเปลี่ยนแปลง",
    failedToAdd: "เพิ่มมังงะไม่สำเร็จ โปรดตรวจสอบ URL",
    unknown: "ไม่ทราบ",
    unknownManga: "ไม่ทราบชื่อมังงะ"
  }
};

interface Manga {
  id: string;
  userId: string;
  title: string;
  imageUrl?: string;
  url: string;
  currentChapter: number;
  totalChapters: number;
  lastUpdated: string;
  createdAt: Timestamp;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [lang, setLang] = useState<'en' | 'th'>('en');
  
  const t = translations[lang];

  const [mangas, setMangas] = useState<Manga[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [mangaToDelete, setMangaToDelete] = useState<string | null>(null);
  const [mangaToEdit, setMangaToEdit] = useState<Manga | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editCurrentChapter, setEditCurrentChapter] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newChapter, setNewChapter] = useState('1');
  const [scraping, setScraping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setMangas([]);
      return;
    }

    const q = query(
      collection(db, 'mangas'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Manga[];
      setMangas(data);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'mangas');
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login error:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const handleAddManga = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newUrl) return;

    setScraping(true);
    setError(null);

    try {
      const response = await axios.post('/api/scrape-manga', { url: newUrl });
      const { title, imageUrl, chapterCount, lastUpdated } = response.data;

      await addDoc(collection(db, 'mangas'), {
        userId: user.uid,
        title: title || t.unknownManga,
        imageUrl: imageUrl || '',
        url: newUrl,
        currentChapter: parseInt(newChapter) || 1,
        totalChapters: chapterCount || 0,
        lastUpdated: lastUpdated || t.unknown,
        createdAt: Timestamp.now()
      });

      setNewUrl('');
      setNewChapter('1');
      setIsAdding(false);
    } catch (err) {
      console.error("Add manga error:", err);
      setError(t.failedToAdd);
    } finally {
      setScraping(false);
    }
  };

  const handleEditManga = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mangaToEdit) return;

    try {
      await updateDoc(doc(db, 'mangas', mangaToEdit.id), {
        title: editTitle,
        imageUrl: editImageUrl,
        currentChapter: parseInt(editCurrentChapter) || 0
      });
      setMangaToEdit(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `mangas/${mangaToEdit.id}`);
    }
  };

  const openEditModal = (manga: Manga) => {
    setMangaToEdit(manga);
    setEditTitle(manga.title);
    setEditImageUrl(manga.imageUrl || '');
    setEditCurrentChapter(manga.currentChapter.toString());
  };

  const updateProgress = async (mangaId: string, newChapter: number) => {
    try {
      await updateDoc(doc(db, 'mangas', mangaId), {
        currentChapter: newChapter
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `mangas/${mangaId}`);
    }
  };

  const deleteManga = async (mangaId: string) => {
    try {
      await deleteDoc(doc(db, 'mangas', mangaId));
      setMangaToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `mangas/${mangaId}`);
    }
  };

  const refreshManga = async (manga: Manga) => {
    try {
      const response = await axios.post('/api/scrape-manga', { url: manga.url });
      const { chapterCount, lastUpdated, imageUrl } = response.data;

      await updateDoc(doc(db, 'mangas', manga.id), {
        totalChapters: chapterCount || manga.totalChapters,
        lastUpdated: lastUpdated || manga.lastUpdated,
        imageUrl: imageUrl || manga.imageUrl
      });
    } catch (err) {
      console.error("Refresh error:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl"
        >
          <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <BookOpen className="w-8 h-8 text-indigo-500" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">{t.title}</h1>
          <p className="text-slate-400 mb-8">{t.subtitle}</p>
          <button 
            onClick={handleLogin}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {t.signIn}
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-500" />
            <span className="text-xl font-bold text-white tracking-tight">{t.title}</span>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setLang(lang === 'en' ? 'th' : 'en')}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all flex items-center gap-2 text-sm font-medium"
              title="Change Language"
            >
              <Languages className="w-5 h-5" />
              <span className="uppercase">{lang}</span>
            </button>
            <button 
              onClick={() => setIsAdding(true)}
              className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
              title={t.addManga}
            >
              <Plus className="w-5 h-5" />
            </button>
            <button 
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
              title={t.logout}
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
            <p className="text-slate-400 text-sm mb-1">{t.totalManga}</p>
            <p className="text-3xl font-bold text-white">{mangas.length}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
            <p className="text-slate-400 text-sm mb-1">{t.chaptersRead}</p>
            <p className="text-3xl font-bold text-white">
              {mangas.reduce((acc, m) => acc + m.currentChapter, 0)}
            </p>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
            <p className="text-slate-400 text-sm mb-1">{t.completed}</p>
            <p className="text-3xl font-bold text-white">
              {mangas.filter(m => m.currentChapter >= m.totalChapters && m.totalChapters > 0).length}
            </p>
          </div>
        </div>

        {/* Manga List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {mangas.map((manga) => (
              <motion.div
                key={manga.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="group bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-indigo-500/50 transition-all shadow-lg flex flex-col"
              >
                <div className="relative h-48 overflow-hidden bg-slate-800">
                  <img 
                    src={manga.imageUrl || `https://loremflickr.com/400/600/manga,anime?lock=${manga.id.charCodeAt(0)}`} 
                    alt={manga.title}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (!target.src.includes('loremflickr.com')) {
                        target.src = `https://loremflickr.com/400/600/manga,anime?lock=${manga.id.charCodeAt(0)}`;
                      }
                    }}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent opacity-60" />
                </div>
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-bold text-white line-clamp-2 leading-tight group-hover:text-indigo-400 transition-colors">
                      {manga.title}
                    </h3>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => openEditModal(manga)}
                        className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-md transition-all"
                        title={t.editManga}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => refreshManga(manga)}
                        className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-md transition-all"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setMangaToDelete(manga.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">{t.progress}</span>
                      <span className="text-white font-medium">
                        Ch. {manga.currentChapter} / {manga.totalChapters || '??'}
                      </span>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: manga.totalChapters ? `${(manga.currentChapter / manga.totalChapters) * 100}%` : '0%' }}
                        className="h-full bg-indigo-500"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => updateProgress(manga.id, Math.max(0, manga.currentChapter - 1))}
                          disabled={manga.currentChapter <= 0}
                          className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
                        >
                          -
                        </button>
                        <button 
                          onClick={() => {
                            const nextChapter = manga.currentChapter + 1;
                            if (manga.totalChapters > 0 && nextChapter > manga.totalChapters) return;
                            updateProgress(manga.id, nextChapter);
                          }}
                          disabled={manga.totalChapters > 0 && manga.currentChapter >= manga.totalChapters}
                          className="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
                        >
                          +
                        </button>
                      </div>
                      <a 
                        href={manga.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex-1 py-2 px-4 bg-slate-800 hover:bg-indigo-600 text-white text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
                      >
                        {t.readNext} <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    {manga.lastUpdated && (
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                        {t.lastUpdated}: {manga.lastUpdated}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {mangas.length === 0 && !isAdding && (
            <div className="col-span-full py-20 text-center">
              <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Plus className="w-8 h-8 text-slate-600" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{t.noManga}</h3>
              <p className="text-slate-400 mb-6">{t.startAdding}</p>
              <button 
                onClick={() => setIsAdding(true)}
                className="py-2 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all"
              >
                {t.addFirst}
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Add Manga Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl"
            >
              <h2 className="text-2xl font-bold text-white mb-6">{t.addNew}</h2>
              <form onSubmit={handleAddManga} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">{t.mangaUrl}</label>
                  <input 
                    type="url" 
                    required
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://example.com/manga/title"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">{t.currentChapter}</label>
                  <input 
                    type="number" 
                    required
                    min="0"
                    value={newChapter}
                    onChange={(e) => setNewChapter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                {error && <p className="text-rose-400 text-sm">{error}</p>}
                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all"
                  >
                    {t.cancel}
                  </button>
                  <button 
                    type="submit"
                    disabled={scraping}
                    className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    {scraping ? <Loader2 className="w-5 h-5 animate-spin" /> : t.addManga}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Edit Manga Modal */}
      <AnimatePresence>
        {mangaToEdit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMangaToEdit(null)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl"
            >
              <h2 className="text-2xl font-bold text-white mb-6">{t.editManga}</h2>
              <form onSubmit={handleEditManga} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">{t.mangaTitle}</label>
                  <input 
                    type="text" 
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">{t.imageUrl}</label>
                  <input 
                    type="text" 
                    value={editImageUrl}
                    onChange={(e) => setEditImageUrl(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">{t.currentChapter}</label>
                  <input 
                    type="number" 
                    required
                    min="0"
                    value={editCurrentChapter}
                    onChange={(e) => setEditCurrentChapter(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => setMangaToEdit(null)}
                    className="flex-1 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all"
                  >
                    {t.cancel}
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all"
                  >
                    {t.saveChanges}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {mangaToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMangaToDelete(null)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center"
            >
              <div className="w-12 h-12 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-rose-500" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">{t.deleteConfirmTitle}</h2>
              <p className="text-slate-400 mb-6">{t.deleteConfirmText}</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setMangaToDelete(null)}
                  className="flex-1 py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl transition-all"
                >
                  {t.cancel}
                </button>
                <button 
                  onClick={() => deleteManga(mangaToDelete)}
                  className="flex-1 py-2 px-4 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl transition-all"
                >
                  {t.delete}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
