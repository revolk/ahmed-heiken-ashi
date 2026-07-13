import { useEffect, useState } from 'react';

/**
 * useAuth.js
 * تسجيل دخول بسيط بتوكن شخصي (بند 13) - بيتنفذ مرة واحدة عند فتح الصفحة.
 * الـ deviceId بيتولّد مرة واحدة ويتحفظ محليًا عشان نفس الجهاز يتعرف عليه
 * تلقائيًا في المرات الجاية من غير ما يستهلك مقعد جهاز جديد كل مرة.
 */
export function useAuth({ apiBaseUrl, accessToken }) {
  const [subscriber, setSubscriber] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }

    const deviceId = getOrCreateDeviceId();

    fetch(`${apiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, deviceId, deviceLabel: navigator.userAgent }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'LOGIN_FAILED');
        setSubscriber({ ...data.subscriber, deviceId });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [apiBaseUrl, accessToken]);

  return { subscriber, error, loading };
}

function getOrCreateDeviceId() {
  const STORAGE_KEY = 'ahmed_heiken_ashi_device_id';
  let id = window.localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
