'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Circle } from 'lucide-react';

export default function OnlineUsers({ currentUserId }: { currentUserId: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!currentUserId) return;

    // 같은 채널에 접속(track)한 사람 수를 실시간으로 센다.
    // presence key를 사용자 id로 두면 한 사람이 여러 탭을 열어도 한 명으로 묶인다.
    const channel = supabase.channel('online-users', {
      config: { presence: { key: currentUserId } },
    });

    channel.on('presence', { event: 'sync' }, () => {
      setCount(Object.keys(channel.presenceState()).length);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // 누가 접속 중인지는 화면에 쓰지 않으므로 이름·계급을 아예 보내지 않는다.
        // 채널 내용은 접속한 사람 모두가 볼 수 있어서, 표시하지 않을 값은 두지 않는 편이 낫다.
        await channel.track({});
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  return (
    <div className="bg-white rounded-lg shadow p-4 flex flex-wrap items-center gap-2 text-sm">
      <span className="flex items-center gap-1.5 font-semibold text-gray-900">
        <Circle size={10} className="fill-green-500 text-green-500" />
        현재 접속자 {count}명
      </span>
    </div>
  );
}
