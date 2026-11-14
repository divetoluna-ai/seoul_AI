export type MemberUser = { id: string; nickname: string };
export type ProfileInput = { nickname: string; petName: string };
export function profileComplete(profile: ProfileInput | null) {
  return !!profile && profile.nickname.trim().length >= 2 && profile.nickname.trim().length <= 16 && profile.petName.trim().length >= 1 && profile.petName.trim().length <= 20;
}
export function profileInput(value: ProfileInput): ProfileInput {
  const result = { nickname: value.nickname.trim(), petName: value.petName.trim() };
  if (result.nickname.length < 2 || result.nickname.length > 16) throw new Error('닉네임은 2~16자로 입력해주세요.');
  if (!result.petName || result.petName.length > 20) throw new Error('반려견 이름은 1~20자로 입력해주세요.');
  return result;
}
