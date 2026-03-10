// Clear all URL-related sessionStorage keys
export function clearUrlSessionStorage() {
  sessionStorage.removeItem('een_url_camera_ids')
  sessionStorage.removeItem('een_url_selected')
  sessionStorage.removeItem('een_url_events')
  sessionStorage.removeItem('een_url_ed')
  sessionStorage.removeItem('een_url_ad')
  sessionStorage.removeItem('een_url_er')
  sessionStorage.removeItem('een_url_ar')
  sessionStorage.removeItem('een_url_live')
  sessionStorage.removeItem('een_url_filter')
  sessionStorage.removeItem('een_url_dark')
  sessionStorage.removeItem('een_url_mute')
  sessionStorage.removeItem('een_url_full')
}
