const avatars: Record<string,string> = {
  cat:'🐱',fox:'🦊',panda:'🐼',rabbit:'🐰',owl:'🦉',bear:'🐻',
  koala:'🐨',penguin:'🐧',otter:'🦦',deer:'🦌',raccoon:'🦝',tiger:'🐯',
};

export function EmployeeAvatar({
  avatarKey,
  name,
  size = 'md',
}: {
  avatarKey?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const key = avatarKey && avatars[avatarKey] ? avatarKey : 'cat';
  return (
    <span
      className={`employee-avatar employee-avatar-${size} avatar-${key}`}
      role="img"
      aria-label={name + ' avatarı'}
      title={name}
    >
      {avatars[key]}
    </span>
  );
}
