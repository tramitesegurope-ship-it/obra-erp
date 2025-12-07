import { useEffect, useState } from 'react';
import { isDeleteUnlocked, subscribeDeleteAuth } from '../lib/deleteAuth';

export function useDeleteAuth() {
  const [unlocked, setUnlocked] = useState(isDeleteUnlocked());

  useEffect(() => {
    const unsubscribe = subscribeDeleteAuth(() => setUnlocked(isDeleteUnlocked()));
    return unsubscribe;
  }, []);

  return unlocked;
}
