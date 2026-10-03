import { Inbox } from 'lucide-react';

export default function EmptyState({
  icon: Icon = Inbox,
  title = 'No items found',
  description = 'There are no records matching your criteria.',
  action,
}) {
  return (
    <div className="py-12 px-4 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 text-[#5b6660] mb-3">
        <Icon size={24} />
      </div>
      <h4 className="text-sm font-semibold text-[#1c2321]">{title}</h4>
      <p className="mt-1 text-xs sm:text-sm text-[#5b6660] max-w-sm mx-auto">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

