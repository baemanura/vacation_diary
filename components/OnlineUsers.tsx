'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Circle } from 'lucide-react';

interface OnlineUser {
  name: string;
  rank: string;
}

export default function OnlineUsers({
  currentUserId,
  name,
  rank,
}: {
  currentUserId: string;
  name: string;
  rank: string;
}) {
  const [users, setUsers] = useState<OnlineUser[]>([]);

  useEffect(() => {
    if (!currentUserId || !name) return;

    // 같은 채널에 접속(track)한 사람들의 목록을 실시간으로 추적한다.
    // presence key를 사용자 id로 두면 한 사람이 여러 탭을 열어도 한 명으로 묶인다.
    const channel = supabase.channel('online-users', {
      config: { presence: { key: currentUserId } },
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<OnlineUser>();
      const list = Object.values(state).map((entries) => entries[0]);
      setUsers(list);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ name, rank });
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, name, rank]);

  return (
    <div className="bg-white rounded-lg shadow p-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="flex items-center gap-1.5 font-semibold text-gray-900">
        <Circle size={10} className="fill-green-500 text-green-500" />
        현재 접속자 {users.length}명
      </span>
      {users.length > 0 && (
        <span className="text-gray-600">
          {users.map((u) => `${u.name} ${u.rank}`).join(', ')}
        </span>
      )}
    </div>
  );
}
