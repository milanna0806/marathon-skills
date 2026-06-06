import { useSession, signOut, signIn } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect, useRef, useState, useCallback } from 'react'
import Image from 'next/image'

const COUNTRIES = [
  'Казахстан','Россия','США','Германия','Франция','Великобритания','Китай','Япония',
  'Бразилия','Канада','Австралия','Индия','Италия','Испания','Нидерланды','Польша',
  'Швеция','Норвегия','Финляндия','Дания','Швейцария','Австрия','Украина','Беларусь',
  'Узбекистан','Кыргызстан','Азербайджан','Грузия','Армения','Молдова','Другая страна'
]

const S = {
  // CSS-in-JS helpers
  vars: {
    primaryDark:'#14142A', navBar:'#1C1C33', cardBg:'#1E1E36', inputBg:'#23233E',
    orange:'#E85D04', orangeHover:'#F06D14', textWhite:'#E8E8F5', textMuted:'#8C8CA5',
    textOrange:'#F4A33C', coord:'#6C63FF', green:'#4CAF50', yellowBmi:'#FFB300',
    blue:'#2196F3', purple:'#9C27B0', red:'#E53935', border:'#2D2D46',
  },
}

function useTimer() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const target = new Date('2026-06-15T09:00:00')
    const tick = () => {
      const diff = target - new Date()
      if (diff <= 0) { setTime('МАРАФОН НАЧАЛСЯ! 🏃'); return }
      const d = Math.floor(diff/86400000)
      const h = Math.floor((diff%86400000)/3600000)
      const m = Math.floor((diff%3600000)/60000)
      const s = Math.floor((diff%60000)/1000)
      setTime(`⏱ До марафона: ${d}д ${h}ч ${m}м ${s}с`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

// ── BMI helpers ──────────────────────────────────────────────────
const C_BLUE='#2196F3', C_GREEN='#4CAF50', C_YELLOW='#FF9800', C_RED='#E53935', C_MUTED='#8C8CA5'
function bmiCategory(v) {
  if (!v) return ''
  if (v < 18.5) return 'Недостаточный вес'
  if (v < 25)   return 'Здоровый вес ✓'
  if (v < 30)   return 'Избыточный вес'
  return 'Ожирение'
}
function bmiColor(v) {
  if (!v) return C_MUTED
  if (v < 18.5) return C_BLUE
  if (v < 25)   return C_GREEN
  if (v < 30)   return C_YELLOW
  return C_RED
}

function drawFigureOnCanvas(canvas, bmiVal, gender) {
  if (!canvas) return
  const w = canvas.offsetWidth || 400, h = canvas.offsetHeight || 160
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0,0,w,h)
  const bc = bmiColor(bmiVal)
  const cx = w/2, cy = h/2 - 8
  const bw = bmiVal === 0 ? 22 : bmiVal < 18.5 ? 15 : bmiVal < 25 ? 22 : bmiVal < 30 ? 30 : 40
  ctx.fillStyle = bc
  ctx.beginPath(); ctx.arc(cx, cy-48, 18, 0, Math.PI*2); ctx.fill()
  ctx.fillRect(cx-bw, cy-29, bw*2, 52)
  ctx.fillRect(cx-bw-14, cy-29, 13, 40)
  ctx.fillRect(cx+bw+1,  cy-29, 13, 40)
  ctx.fillRect(cx-bw+4,  cy+23, bw-8, 44)
  ctx.fillRect(cx+4,     cy+23, bw-8, 44)
  ctx.font = 'bold 13px Segoe UI'; ctx.fillStyle = bc; ctx.textAlign = 'center'
  ctx.fillText(gender === 'Женский' ? '♀' : '♂', cx, h - 5)
}

function drawGaugeOnCanvas(canvas, bmiVal) {
  if (!canvas) return
  const pw = (canvas.offsetWidth || 400) - 20
  canvas.width = canvas.offsetWidth || 400; canvas.height = canvas.offsetHeight || 56
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0,0,canvas.width,canvas.height)
  const gx=10, gy=14, gh=16
  const segs = [
    {color:C_BLUE, label:'Недостат.', w:.22},
    {color:C_GREEN,label:'Здоровый',  w:.30},
    {color:C_YELLOW,label:'Избыточ.',  w:.24},
    {color:C_RED,  label:'Ожирение',   w:.24},
  ]
  let x = gx
  segs.forEach(s => {
    const sw = pw * s.w
    ctx.fillStyle = s.color; ctx.fillRect(x, gy, sw, gh)
    ctx.fillStyle = '#fff'; ctx.font = '8px Segoe UI'; ctx.textAlign = 'center'
    ctx.fillText(s.label, x + sw/2, gy + gh + 10)
    x += sw
  })
  if (bmiVal > 0) {
    const norm = Math.min(Math.max((bmiVal - 10) / 30, 0), 1)
    const mx = gx + norm * pw
    ctx.fillStyle = '#fff'; ctx.beginPath()
    ctx.moveTo(mx, gy-1); ctx.lineTo(mx-6, gy-10); ctx.lineTo(mx+6, gy-10); ctx.closePath(); ctx.fill()
  }
}

// ── Shared input style ───────────────────────────────────────────
const inputStyle = {
  width:'100%', background:'#23233E', border:'1px solid #35355A', color:'#E8E8F5',
  borderRadius:3, padding:'0 10px', height:30, fontFamily:'inherit', fontSize:11,
}
const selectStyle = { ...inputStyle }
const btnOrange = {
  cursor:'pointer', border:'none', borderRadius:4, fontFamily:'inherit', fontSize:11,
  display:'inline-flex', alignItems:'center', gap:5, whiteSpace:'nowrap',
  background:'#E85D04', color:'#fff', padding:'0 14px', height:34, fontWeight:600,
}
const btnNav = {
  ...btnOrange, background:'#252540', fontWeight:400, border:'1px solid #35355A',
}
const btnDark = { ...btnNav }

// ── NAVBAR ───────────────────────────────────────────────────────
function Navbar({ onUsers, onRegister, onAdminLogin, session, isAdmin, onAdminLogout }) {
  return (
    <nav style={{
      background:'#1C1C33', borderBottom:'2px solid #E85D04', height:58,
      display:'flex', alignItems:'center', padding:'0 14px', position:'sticky',
      top:0, zIndex:100, gap:10, flexShrink:0,
    }}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <span style={{fontSize:24}}>🏃</span>
        <div>
          <div style={{fontSize:13,fontWeight:700}}>MARATHON SKILLS</div>
          <div style={{fontSize:9,color:'#E85D04'}}>2026</div>
        </div>
      </div>
      <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center'}}>
        {session?.user ? (
          <>
            {isAdmin && <span style={{background:'#2D1F00',border:'1px solid #E85D04',borderRadius:4,padding:'3px 8px',fontSize:9,fontWeight:700,color:'#E85D04'}}>🔑 АДМИНИСТРАТОР</span>}
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              {session.user.image && (
                <img src={session.user.image} alt="" width={28} height={28}
                  style={{borderRadius:'50%',border:'2px solid #E85D04'}} />
              )}
              <span style={{fontSize:10,color:'#E8E8F5',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {session.user.name?.split(' ')[0]}
              </span>
            </div>
            <button style={btnNav} onClick={onUsers}>👥 &nbsp;Участники</button>
            <button style={btnOrange} onClick={onRegister}>✚ &nbsp;Регистрация</button>
            {isAdmin
              ? <button style={{...btnNav,color:'#F4A33C'}} onClick={onAdminLogout}>🚪 &nbsp;Выйти из адм.</button>
              : <button style={btnNav} onClick={onAdminLogin}>🔒 &nbsp;Админ</button>
            }
            <button style={{...btnNav,color:'#8C8CA5'}} onClick={() => signOut({callbackUrl:'/'})}>⏻</button>
          </>
        ) : (
          <button
            onClick={() => signIn('google', { callbackUrl: '/' })}
            style={{
              display:'inline-flex', alignItems:'center', gap:8,
              background:'#fff', color:'#1a1a2e', border:'none', borderRadius:6,
              padding:'7px 16px', fontSize:12, fontWeight:600, cursor:'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Войти через Google
          </button>
        )}
      </div>
    </nav>
  )
}

// ── TIMER BAR ────────────────────────────────────────────────────
function TimerBar() {
  const time = useTimer()
  return (
    <div style={{
      background:'#11111F', borderTop:'2px solid #E85D04', height:40,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:11, fontWeight:700, color:'#E85D04', flexShrink:0,
    }}>
      {time}
    </div>
  )
}

// ── REGISTER MODAL ───────────────────────────────────────────────
function RegisterModal({ open, onClose, onSave, editData }) {
  const isEdit = !!editData
  const [form, setForm] = useState({
    email:'', password:'', password2:'', name:'', surname:'',
    gender:'Мужской', role:'Бегун', country:'Казахстан', dob:'1990-01-01', photo:'', photoName:''
  })
  const [msg, setMsg] = useState({text:'',ok:false})

  useEffect(() => {
    if (editData) {
      setForm({
        email: editData.email||'', password:'', password2:'',
        name: editData.name||'', surname: editData.surname||'',
        gender: editData.gender||'Мужской', role: editData.role||'Бегун',
        country: editData.country||'Казахстан', dob: editData.dob||'1990-01-01',
        photo: editData.photo||'', photoName: editData.photo ? 'фото загружено' : ''
      })
    } else {
      setForm({email:'',password:'',password2:'',name:'',surname:'',gender:'Мужской',role:'Бегун',country:'Казахстан',dob:'1990-01-01',photo:'',photoName:''})
    }
    setMsg({text:'',ok:false})
  }, [editData, open])

  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const onPhoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => set('photo', ev.target.result)
    reader.readAsDataURL(file)
    set('photoName', file.name)
  }

  const submit = async () => {
    if (!form.email || !form.name || !form.surname) {
      setMsg({text:'Заполните все обязательные поля.', ok:false}); return
    }
    if (!isEdit && form.password.length < 6) {
      setMsg({text:'Пароль минимум 6 символов.', ok:false}); return
    }
    if (!isEdit && form.password !== form.password2) {
      setMsg({text:'Пароли не совпадают.', ok:false}); return
    }
    await onSave({
      email: form.email, name: form.name, surname: form.surname,
      gender: form.gender, role: form.role, country: form.country,
      dob: form.dob, photo: form.photo,
    }, editData?.id)
    setMsg({text: isEdit ? 'Данные обновлены!' : 'Участник зарегистрирован!', ok:true})
    setTimeout(() => { onClose(); setMsg({text:'',ok:false}) }, 900)
  }

  if (!open) return null
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200}}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{background:'#14142A',border:'1px solid #2D2D46',borderRadius:8,width:'min(860px,95vw)',maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column'}}>
        <div style={{background:'#1C1C33',borderBottom:'2px solid #E85D04',height:52,display:'flex',alignItems:'center',padding:'0 14px',gap:10,flexShrink:0}}>
          <button style={btnNav} onClick={onClose}>← Назад</button>
          <span style={{fontSize:12,fontWeight:700}}>MARATHON SKILLS 2026</span>
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'16px 30px 20px'}}>
          <div style={{fontSize:20,fontWeight:700,color:'#F4A33C',textAlign:'center',marginBottom:4}}>{isEdit ? 'Редактирование' : 'Регистрация участника'}</div>
          <div style={{fontSize:10,color:'#8C8CA5',textAlign:'center',marginBottom:14}}>Заполните все поля для регистрации участника марафона</div>

          <div style={{background:'#1E1E36',border:'1px solid #2D2D46',borderRadius:6,padding:'20px'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 220px',gap:20}}>
              {/* LEFT */}
              <div style={{display:'grid',gridTemplateColumns:'130px 1fr',gap:8,alignItems:'center'}}>
                <label style={{color:'#8C8CA5'}}>Email:</label>
                <input style={inputStyle} value={form.email} onChange={e=>set('email',e.target.value)} placeholder="user@example.com"/>
                {!isEdit && <>
                  <label style={{color:'#8C8CA5'}}>Пароль:</label>
                  <input style={inputStyle} type="password" value={form.password} onChange={e=>set('password',e.target.value)} placeholder="Минимум 6 символов"/>
                  <label style={{color:'#8C8CA5'}}>Повтор пароля:</label>
                  <input style={inputStyle} type="password" value={form.password2} onChange={e=>set('password2',e.target.value)}/>
                </>}
                <label style={{color:'#8C8CA5'}}>Имя:</label>
                <input style={inputStyle} value={form.name} onChange={e=>set('name',e.target.value)}/>
                <label style={{color:'#8C8CA5'}}>Фамилия:</label>
                <input style={inputStyle} value={form.surname} onChange={e=>set('surname',e.target.value)}/>
                <label style={{color:'#8C8CA5'}}>Пол:</label>
                <select style={selectStyle} value={form.gender} onChange={e=>set('gender',e.target.value)}>
                  <option>Мужской</option><option>Женский</option>
                </select>
                <label style={{color:'#8C8CA5'}}>Роль:</label>
                <select style={selectStyle} value={form.role} onChange={e=>set('role',e.target.value)}>
                  <option>Бегун</option><option>Координатор</option>
                </select>
              </div>
              {/* RIGHT */}
              <div>
                <div style={{background:'#23233E',border:'1px solid #3C3C5A',height:120,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',borderRadius:4,overflow:'hidden',position:'relative'}}
                  onClick={() => document.getElementById('photoFileInput').click()}>
                  {form.photo
                    ? <img src={form.photo} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                    : <div style={{textAlign:'center'}}><div style={{fontSize:26}}>📷</div><div style={{fontSize:9,color:'#8C8CA5'}}>Нажмите для выбора</div></div>
                  }
                </div>
                <input type="file" id="photoFileInput" accept="image/*" style={{display:'none'}} onChange={onPhoto}/>
                <div style={{marginTop:6,display:'flex',gap:5}}>
                  <input style={{...inputStyle,height:26,fontSize:9,color:'#8C8CA5'}} readOnly value={form.photoName}/>
                  <button style={{...btnDark,height:26,padding:'0 8px',fontSize:13}} onClick={()=>document.getElementById('photoFileInput').click()}>📁</button>
                </div>
                <label style={{color:'#8C8CA5',display:'block',marginBottom:4,fontSize:10,marginTop:12}}>Дата рождения:</label>
                <input style={inputStyle} type="date" value={form.dob} onChange={e=>set('dob',e.target.value)}/>
                <label style={{color:'#8C8CA5',display:'block',marginBottom:4,fontSize:10,marginTop:10}}>Страна:</label>
                <select style={selectStyle} value={form.country} onChange={e=>set('country',e.target.value)}>
                  {COUNTRIES.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {msg.text && <div style={{textAlign:'center',fontWeight:700,fontSize:11,padding:8,borderRadius:4,margin:'10px 0',background:msg.ok?'rgba(76,175,80,.15)':'rgba(232,93,4,.15)',color:msg.ok?'#4CAF50':'#E85D04'}}>{msg.text}</div>}

          <div style={{display:'flex',gap:10,justifyContent:'center',marginTop:4}}>
            <button style={{...btnOrange,height:40,fontSize:12,padding:'0 22px'}} onClick={submit}>✔ &nbsp;{isEdit ? 'Сохранить' : 'Зарегистрироваться'}</button>
            <button style={{...btnDark,height:40,fontSize:11,padding:'0 18px'}} onClick={onClose}>Отмена</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── PROFILE MODAL ────────────────────────────────────────────────
function ProfileModal({ open, onClose, participant, isAdmin, onEdit, onBMI }) {
  if (!open || !participant) return null
  const p = participant
  const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']
  const formatDate = (dob) => {
    if (!dob) return '—'
    const [y,m,d] = dob.split('-')
    return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`
  }
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200}}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{background:'#14142A',border:'1px solid #2D2D46',borderRadius:8,width:'min(600px,95vw)',maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column'}}>
        <div style={{background:'#1C1C33',borderBottom:'2px solid #E85D04',height:52,display:'flex',alignItems:'center',padding:'0 14px',gap:10}}>
          <button style={btnNav} onClick={onClose}>← Закрыть</button>
          <span style={{fontSize:12,fontWeight:700}}>ПРОФИЛЬ УЧАСТНИКА</span>
          {isAdmin && <button style={{...btnOrange,height:32,padding:'0 12px',marginLeft:'auto'}} onClick={()=>onEdit(p)}>✏️ &nbsp;Редактировать</button>}
        </div>
        <div style={{flex:1,overflowY:'auto',padding:'16px 30px 20px'}}>
          <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:20}}>
            <div style={{width:80,height:80,background:'#23233E',borderRadius:'50%',border:'2px solid #2D2D46',display:'flex',alignItems:'center',justifyContent:'center',fontSize:40,overflow:'hidden',flexShrink:0}}>
              {p.photo ? <img src={p.photo} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/> : <span>{p.gender==='Женский'?'👩':'👨'}</span>}
            </div>
            <div>
              <div style={{fontSize:22,fontWeight:700}}>{p.name} {p.surname}</div>
              <div style={{fontSize:13,fontWeight:600,color:p.role==='Бегун'?'rgb(120,200,255)':'#6C63FF'}}>{p.role}</div>
              <div style={{fontSize:11,color:'#8C8CA5'}}>{p.email}</div>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
            {[
              ['📧 Email', p.email],
              ['⚧ Пол', p.gender],
              ['🎂 Дата рождения', formatDate(p.dob)],
              ['🌍 Страна', p.country||'—'],
              ['📊 ИМТ', p.bmi ? p.bmi.toFixed(1) : '—'],
              ['🏷 Роль', p.role],
              ['📅 Зарегистрирован', p.created_at ? new Date(p.created_at).toLocaleDateString('ru') : '—'],
            ].map(([lbl,val]) => (
              <div key={lbl} style={{background:'#23233E',borderRadius:4,padding:'10px 12px'}}>
                <div style={{fontSize:9,color:'#8C8CA5',marginBottom:2}}>{lbl}</div>
                <div style={{fontSize:12,fontWeight:500}}>{val}</div>
              </div>
            ))}
          </div>
          {isAdmin && (
            <div style={{display:'flex',gap:10,justifyContent:'center'}}>
              <button style={{...btnOrange,height:36}} onClick={()=>onBMI(p)}>📊 &nbsp;Рассчитать ИМТ</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── CONFIRM MODAL ────────────────────────────────────────────────
function ConfirmModal({ open, name, onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300}}>
      <div style={{background:'#1E1E36',border:'1px solid #2D2D46',borderRadius:8,padding:'28px 36px',textAlign:'center',width:'min(400px,90vw)'}}>
        <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>Удалить участника?</div>
        <div style={{fontSize:11,color:'#8C8CA5',marginBottom:24}}>{name}</div>
        <div style={{display:'flex',gap:10,justifyContent:'center'}}>
          <button style={{...btnOrange,background:'#B71C1C',height:36}} onClick={onConfirm}>🗑 Удалить</button>
          <button style={{...btnDark,height:36}} onClick={onCancel}>Отмена</button>
        </div>
      </div>
    </div>
  )
}

// ── BMI PAGE ─────────────────────────────────────────────────────
function BMIPage({ runner, onBack, onSave }) {
  const [height, setHeight] = useState('170')
  const [weight, setWeight] = useState('70')
  const [gender, setGender] = useState('Мужской')
  const [bmiVal, setBmiVal] = useState(0)
  const figRef = useRef(null)
  const gaugeRef = useRef(null)

  useEffect(() => {
    if (runner) {
      setGender(runner.gender || 'Мужской')
    }
    setBmiVal(0)
  }, [runner])

  useEffect(() => {
    drawFigureOnCanvas(figRef.current, bmiVal, gender)
    drawGaugeOnCanvas(gaugeRef.current, bmiVal)
  }, [bmiVal, gender])

  const calc = () => {
    const h = parseFloat(height), w = parseFloat(weight)
    if (!h || !w) return
    const hm = h / 100
    setBmiVal(Math.round(w / (hm*hm) * 10) / 10)
  }

  const color = bmiColor(bmiVal)
  const cat = bmiCategory(bmiVal)

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh'}}>
      <nav style={{background:'#1C1C33',borderBottom:'2px solid #E85D04',height:52,display:'flex',alignItems:'center',padding:'0 14px',gap:10,flexShrink:0}}>
        <button style={{...btnNav,height:36}} onClick={onBack}>← Назад</button>
        <span style={{fontSize:12,fontWeight:700,margin:'0 auto'}}>ИМТ КАЛЬКУЛЯТОР</span>
        <button style={{...btnOrange,height:36,width:140}} onClick={() => { if (!bmiVal){alert('Сначала рассчитайте ИМТ.');return} onSave(bmiVal) }}>💾 &nbsp;Сохранить</button>
      </nav>
      <div style={{flex:1,overflowY:'auto',padding:20}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,height:'calc(100% - 20px)'}}>
          {/* Left */}
          <div style={{background:'#1E1E36',border:'1px solid #2D2D46',borderRadius:6,padding:18}}>
            <p style={{fontSize:10,color:'#8C8CA5',marginBottom:18,lineHeight:1.5}}>ИМТ = вес (кг) / рост² (м)<br/>Помогает оценить соответствие веса и роста.</p>
            <div style={{marginBottom:14}}>
              <span style={{color:'#8C8CA5'}}>Пол:&nbsp;</span>
              {['Мужской','Женский'].map(g=>(
                <label key={g} style={{color:'#E8E8F5',cursor:'pointer',marginRight:16,display:'inline-flex',alignItems:'center',gap:6}}>
                  <input type="radio" name="bmiGender" value={g} checked={gender===g} onChange={()=>setGender(g)}/> {g==='Мужской'?'♂':'♀'} {g}
                </label>
              ))}
            </div>
            {[['Рост','bmiH',height,setHeight,'см'],['Вес','bmiW',weight,setWeight,'кг']].map(([lbl,id,val,setter,unit])=>(
              <div key={id} style={{display:'grid',gridTemplateColumns:'100px 90px auto',alignItems:'center',gap:8,marginBottom:14}}>
                <label style={{color:'#8C8CA5'}}>{lbl}:</label>
                <input style={{...inputStyle,height:32}} value={val} onChange={e=>setter(e.target.value.replace(/[^\d]/g,''))}/>
                <span style={{color:'#8C8CA5',fontSize:11}}>{unit}</span>
              </div>
            ))}
            <div style={{display:'flex',gap:10}}>
              <button style={{...btnOrange,height:40,fontSize:11}} onClick={calc}>▶ &nbsp;Рассчитать</button>
              <button style={{...btnDark,height:40,fontSize:11}} onClick={()=>setBmiVal(0)}>Сброс</button>
            </div>
          </div>
          {/* Right */}
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <div style={{background:'#1E1E36',border:'1px solid #2D2D46',borderRadius:6,height:160,overflow:'hidden'}}>
              <canvas ref={figRef} style={{width:'100%',height:'100%'}}/>
            </div>
            <div style={{background:'#1E1E36',border:'1px solid #2D2D46',borderRadius:6,height:90,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:12}}>
              <div style={{fontSize:30,fontWeight:700,color:bmiVal?color:'#E8E8F5'}}>{bmiVal?bmiVal.toFixed(1):'—'}</div>
              <div style={{fontSize:15,fontWeight:700,color:color}}>{cat}</div>
            </div>
            <div style={{background:'#1E1E36',border:'1px solid #2D2D46',borderRadius:6,height:72,overflow:'hidden',padding:'8px 12px'}}>
              <canvas ref={gaugeRef} style={{width:'100%',height:'100%'}}/>
            </div>
          </div>
        </div>
      </div>
      <div style={{background:'#1C1C33',borderTop:'1px solid #E85D04',height:44,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
        <span style={{fontSize:11,fontWeight:600}}>👤 {runner ? `${runner.name} ${runner.surname}` : '...'}</span>
      </div>
    </div>
  )
}

// ── ADMIN LOGIN PAGE ─────────────────────────────────────────────
function AdminLoginPage({ onBack, onLogin }) {
  const [login, setLogin] = useState('')
  const [pass, setPass]   = useState('')
  const [err, setErr]     = useState('')
  const doLogin = () => {
    if (login === 'admin' && pass === 'admin123') { onLogin(); setErr('') }
    else setErr('Неверный логин или пароль')
  }
  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh'}}>
      <nav style={{background:'#1C1C33',borderBottom:'2px solid #E85D04',height:58,display:'flex',alignItems:'center',padding:'0 14px',gap:10}}>
        <button style={btnNav} onClick={onBack}>← Назад</button>
        <span style={{fontSize:12,fontWeight:700,marginLeft:16}}>MARATHON SKILLS 2026</span>
      </nav>
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{background:'#1E1E36',border:'1px solid #2D2D46',borderRadius:6,width:'min(420px,90vw)',padding:'36px 36px 32px'}}>
          <div style={{fontSize:20,fontWeight:700,color:'#F4A33C',textAlign:'center',marginBottom:10}}>Форма авторизации</div>
          <div style={{fontSize:10,color:'#8C8CA5',textAlign:'center',marginBottom:24}}>Пожалуйста, авторизуйтесь в системе, используя ваш логин и пароль.</div>
          {[['Login',login,setLogin,'text'],['Password',pass,setPass,'password']].map(([lbl,val,setter,type])=>(
            <div key={lbl} style={{display:'grid',gridTemplateColumns:'100px 1fr',alignItems:'center',gap:8,marginBottom:12}}>
              <label style={{color:'#8C8CA5',textAlign:'right',paddingRight:12}}>{lbl}:</label>
              <input style={{...inputStyle,height:32}} type={type} value={val} onChange={e=>setter(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doLogin()}/>
            </div>
          ))}
          {err && <div style={{color:'#E85D04',fontSize:11,textAlign:'center',marginBottom:12}}>{err}</div>}
          <div style={{display:'flex',gap:10,justifyContent:'center'}}>
            <button style={{...btnOrange,height:36,padding:'0 24px'}} onClick={doLogin}>Login</button>
            <button style={{...btnDark,height:36,padding:'0 20px'}} onClick={onBack}>Cancel</button>
          </div>
        </div>
      </div>
      <TimerBar/>
    </div>
  )
}

// ── USERS TABLE ───────────────────────────────────────────────────
function UsersPage({ participants, isAdmin, onBack, onProfile, onEdit, onDelete, onBMI, loading }) {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('Все роли')
  const [sort, setSort] = useState('По имени')
  const [page, setPage] = useState(1)
  const PER_PAGE = 15

  let list = [...participants]
  if (roleFilter !== 'Все роли') list = list.filter(p => p.role === roleFilter)
  if (search) {
    const q = search.toLowerCase()
    list = list.filter(p => `${p.name} ${p.surname} ${p.email}`.toLowerCase().includes(q))
  }
  list.sort((a,b) => {
    if (sort==='По имени')    return (a.name||'').localeCompare(b.name||'')
    if (sort==='По фамилии')  return (a.surname||'').localeCompare(b.surname||'')
    if (sort==='По Email')    return (a.email||'').localeCompare(b.email||'')
    if (sort==='По роли')     return (a.role||'').localeCompare(b.role||'')
    if (sort==='По стране')   return (a.country||'').localeCompare(b.country||'')
    return 0
  })
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE))
  const paged = list.slice((page-1)*PER_PAGE, page*PER_PAGE)

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh'}}>
      <nav style={{background:'#1C1C33',borderBottom:'2px solid #E85D04',height:58,display:'flex',alignItems:'center',padding:'0 14px',gap:10,flexShrink:0}}>
        <button style={btnNav} onClick={onBack}>← Назад</button>
        <span style={{fontSize:12,fontWeight:700,marginLeft:6}}>MARATHON SKILLS 2026</span>
        {isAdmin && <button style={{...btnOrange,marginLeft:'auto',height:32,fontSize:11}} onClick={()=>onEdit(null)}>✚ &nbsp;Добавить</button>}
      </nav>

      <div style={{background:'#1E1E36',borderBottom:'2px solid #E85D04',padding:16}}>
        <div style={{fontSize:17,fontWeight:700,color:'#F4A33C',marginBottom:10}}>Список зарегистрированных участников</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'center'}}>
          <span style={{color:'#8C8CA5'}}>Роль:</span>
          <select style={{...selectStyle,width:'auto',height:28,padding:'0 8px'}} value={roleFilter} onChange={e=>{setRoleFilter(e.target.value);setPage(1)}}>
            <option>Все роли</option><option>Бегун</option><option>Координатор</option>
          </select>
          <span style={{color:'#8C8CA5'}}>Сортировка:</span>
          <select style={{...selectStyle,width:'auto',height:28,padding:'0 8px'}} value={sort} onChange={e=>setSort(e.target.value)}>
            {['По имени','По фамилии','По Email','По роли','По стране'].map(o=><option key={o}>{o}</option>)}
          </select>
          <span style={{color:'#8C8CA5'}}>Поиск:</span>
          <input style={{...inputStyle,width:180,height:28}} placeholder="Поиск по имени, email..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/>
        </div>
      </div>

      <div style={{flex:1,overflowY:'auto'}}>
        {loading ? (
          <div style={{textAlign:'center',padding:40,color:'#8C8CA5'}}>Загрузка...</div>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr>
                {['#','Имя','Фамилия','Email','Страна','ИМТ','Роль'].map(h=>(
                  <th key={h} style={{background:'#18183A',color:'#8C8CA5',fontWeight:600,fontSize:10,padding:'8px 10px',textAlign:'left',position:'sticky',top:0,borderBottom:'2px solid #2D2D46'}}>{h}</th>
                ))}
                {isAdmin && <><th style={{background:'#18183A',width:46,position:'sticky',top:0,borderBottom:'2px solid #2D2D46'}}/><th style={{background:'#18183A',width:46,position:'sticky',top:0,borderBottom:'2px solid #2D2D46'}}/></>}
              </tr>
            </thead>
            <tbody>
              {paged.map((p,i)=>(
                <tr key={p.id} style={{borderBottom:'1px solid #1E1E3A',cursor:'pointer'}}
                  onClick={()=>onProfile(p)}>
                  <td style={{padding:'7px 10px',fontSize:11,color:'#8C8CA5'}}>{(page-1)*PER_PAGE+i+1}</td>
                  <td style={{padding:'7px 10px',fontSize:11}}>{p.name}</td>
                  <td style={{padding:'7px 10px',fontSize:11}}>{p.surname}</td>
                  <td style={{padding:'7px 10px',fontSize:11,color:'#2196F3'}}>{p.email}</td>
                  <td style={{padding:'7px 10px',fontSize:11}}>{p.country||'—'}</td>
                  <td style={{padding:'7px 10px',fontSize:11,color:p.bmi?bmiColor(p.bmi):'#8C8CA5'}}>{p.bmi?p.bmi.toFixed(1):'—'}</td>
                  <td style={{padding:'7px 10px',fontSize:11,color:p.role==='Бегун'?'rgb(120,200,255)':'#6C63FF'}}>{p.role}</td>
                  {isAdmin && <>
                    <td style={{padding:'7px 4px'}} onClick={e=>{e.stopPropagation();onEdit(p)}}>
                      <button style={{background:'#23233E',color:'#fff',border:'none',borderRadius:3,height:22,padding:'0 6px',cursor:'pointer',fontSize:11}}>✏</button>
                    </td>
                    <td style={{padding:'7px 4px'}} onClick={e=>{e.stopPropagation();onDelete(p)}}>
                      <button style={{background:'#3C1919',color:'#fff',border:'none',borderRadius:3,height:22,padding:'0 6px',cursor:'pointer',fontSize:11}}>🗑</button>
                    </td>
                  </>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{background:'#1E1E36',borderTop:'1px solid #23233E',height:42,display:'flex',alignItems:'center',padding:'0 12px',flexShrink:0}}>
        <span style={{color:'#8C8CA5',fontSize:10}}>Всего: {list.length} участников</span>
        <div style={{display:'flex',alignItems:'center',gap:8,margin:'0 auto'}}>
          <button style={{...btnDark,width:56,height:26,fontSize:11}} disabled={page<=1} onClick={()=>setPage(p=>p-1)}>◀</button>
          <span style={{color:'#8C8CA5',fontSize:10,minWidth:80,textAlign:'center'}}>Стр. {page} / {pages}</span>
          <button style={{...btnDark,width:56,height:26,fontSize:11}} disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>▶</button>
        </div>
      </div>
      <TimerBar/>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════
export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [participants, setParticipants] = useState([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState('main') // main | users | bmi | adminLogin
  const [isAdmin, setIsAdmin] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileTarget, setProfileTarget] = useState(null)
  const [bmiTarget, setBmiTarget] = useState(null)
  const [confirmTarget, setConfirmTarget] = useState(null)

  useEffect(() => {
    if (status === 'authenticated') fetchParticipants()
  }, [status])

  const fetchParticipants = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/participants')
      if (res.ok) setParticipants(await res.json())
    } finally {
      setLoading(false)
    }
  }

  const saveParticipant = async (data, id) => {
    if (id) {
      const res = await fetch(`/api/participants/${id}`, {
        method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
      })
      if (res.ok) {
        const updated = await res.json()
        setParticipants(ps => ps.map(p => p.id===id ? updated : p))
      }
    } else {
      const res = await fetch('/api/participants', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
      })
      if (res.ok) {
        const created = await res.json()
        setParticipants(ps => [created, ...ps])
      }
    }
  }

  const deleteParticipant = async (id) => {
    await fetch(`/api/participants/${id}`, { method:'DELETE' })
    setParticipants(ps => ps.filter(p => p.id !== id))
    setConfirmTarget(null)
  }

  const saveBMI = async (bmiVal) => {
    if (!bmiTarget) return
    const res = await fetch(`/api/participants/${bmiTarget.id}`, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...bmiTarget, bmi: bmiVal})
    })
    if (res.ok) {
      const updated = await res.json()
      setParticipants(ps => ps.map(p => p.id===bmiTarget.id ? updated : p))
    }
    setBmiTarget(null)
    setView('users')
  }

  // Stats
  const runners = participants.filter(p=>p.role==='Бегун').length
  const coords  = participants.filter(p=>p.role==='Координатор').length
  const bmis    = participants.filter(p=>p.bmi).map(p=>p.bmi)
  const avgBMI  = bmis.length ? (bmis.reduce((a,b)=>a+b,0)/bmis.length).toFixed(1) : '—'
  const topCountry = (() => {
    const c={}; participants.forEach(p=>{ if(p.country) c[p.country]=(c[p.country]||0)+1 })
    return Object.entries(c).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—'
  })()

  if (status === 'loading') return <div style={{background:'#14142A',color:'#E8E8F5',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center'}}>Загрузка...</div>

  // ── PUBLIC LANDING (not logged in) ──────────────────────────────
  if (!session) {
    return (
      <div style={{display:'flex',flexDirection:'column',minHeight:'100vh',background:'#14142A',fontFamily:"'Segoe UI', system-ui, sans-serif",color:'#E8E8F5'}}>
        <Navbar session={null} isAdmin={false} onUsers={()=>{}} onRegister={()=>{}} onAdminLogin={()=>{}} onAdminLogout={()=>{}}/>

        {/* Hero */}
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 24px',textAlign:'center'}}>
          <div style={{fontSize:64,marginBottom:16}}>🏃</div>
          <div style={{fontSize:32,fontWeight:800,marginBottom:8,letterSpacing:1}}>MARATHON SKILLS</div>
          <div style={{fontSize:16,color:'#E85D04',fontWeight:700,marginBottom:8}}>2026</div>
          <div style={{fontSize:14,color:'#8C8CA5',marginBottom:4}}>42.195 КМ · 15 ИЮНЯ 2026 · АЛМАТЫ</div>
          <div style={{fontSize:12,color:'#8C8CA5',marginBottom:40}}>Войдите через Google, чтобы зарегистрироваться на марафон или управлять участниками</div>

          {/* Google Sign In */}
          <button
            onClick={() => signIn('google', { callbackUrl: '/' })}
            style={{
              display:'inline-flex', alignItems:'center', gap:12,
              background:'#fff', color:'#1a1a2e', border:'none', borderRadius:8,
              padding:'14px 32px', fontSize:15, fontWeight:600, cursor:'pointer',
              boxShadow:'0 4px 20px rgba(0,0,0,0.4)', marginBottom:48,
              transition:'.15s',
            }}
            onMouseOver={e=>e.currentTarget.style.background='#f0f0f0'}
            onMouseOut={e=>e.currentTarget.style.background='#fff'}
          >
            <svg width="22" height="22" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              <path fill="none" d="M0 0h48v48H0z"/>
            </svg>
            Войти через Google
          </button>

          {/* Telegram Banner */}
          <a
            href="https://t.me/martthon_bot"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display:'flex', alignItems:'center', gap:14,
              background:'linear-gradient(135deg,#0d1f3c 0%,#1a3a5c 100%)',
              border:'1px solid #2196F3', borderRadius:10, padding:'14px 18px',
              marginBottom:20, textDecoration:'none', cursor:'pointer',
              maxWidth:700, width:'100%',
            }}
          >
            <div style={{
              width:44, height:44, borderRadius:'50%', flexShrink:0,
              background:'#2196F3', display:'flex', alignItems:'center',
              justifyContent:'center', fontSize:22,
            }}>✈️</div>
            <div style={{flex:1, textAlign:'left'}}>
              <div style={{fontSize:13,fontWeight:700,color:'#E8E8F5',marginBottom:3}}>
                Есть вопросы? Спроси бота в Telegram
              </div>
              <div style={{fontSize:10,color:'#8C8CA5'}}>
                Найди участника по имени или фамилии · Узнай как зарегистрироваться
              </div>
            </div>
            <div style={{
              background:'#2196F3', color:'#fff', borderRadius:6,
              padding:'6px 14px', fontSize:11, fontWeight:700, flexShrink:0,
            }}>Открыть →</div>
          </a>

          {/* Info cards */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12,maxWidth:700,width:'100%'}}>
            {[
              ['#E85D04','🏃 Марафон — испытание воли','Дистанция 42,195 км объединяет профессионалов и любителей в едином порыве выносливости.'],
              ['#2196F3','💪 «Стена» на 30–35 км','В этот момент запасы гликогена истощаются. Преодоление — вопрос чистого упрямства.'],
              ['#4CAF50','🌆 Города без машин','Уникальный шанс увидеть город иначе: пробежать по мостам под крики болельщиков.'],
            ].map(([color,title,desc])=>(
              <div key={title} style={{display:'flex',alignItems:'stretch',background:'#1E1E36',border:'1px solid #28283E',borderRadius:8,overflow:'hidden',textAlign:'left'}}>
                <div style={{width:4,flexShrink:0,background:color}}/>
                <div style={{padding:'12px 14px'}}>
                  <div style={{fontSize:12,fontWeight:700,marginBottom:4}}>{title}</div>
                  <div style={{fontSize:10,color:'#8C8CA5',lineHeight:1.5}}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <TimerBar/>
      </div>
    )
  }

  // ── BMI VIEW ────────────────────────────────────────────────────
  if (view === 'bmi') {
    return <BMIPage runner={bmiTarget} onBack={()=>{setBmiTarget(null);setView('users')}} onSave={saveBMI}/>
  }

  // ── ADMIN LOGIN VIEW ─────────────────────────────────────────────
  if (view === 'adminLogin') {
    return <AdminLoginPage onBack={()=>setView('main')} onLogin={()=>{setIsAdmin(true);setView('users')}}/>
  }

  // ── USERS VIEW ───────────────────────────────────────────────────
  if (view === 'users') {
    return (
      <>
        <UsersPage
          participants={participants}
          isAdmin={isAdmin}
          loading={loading}
          onBack={()=>setView('main')}
          onProfile={p=>{setProfileTarget(p);setProfileOpen(true)}}
          onEdit={p=>{setEditTarget(p);setRegisterOpen(true)}}
          onDelete={p=>setConfirmTarget(p)}
          onBMI={p=>{setBmiTarget(p);setView('bmi')}}
        />
        <RegisterModal open={registerOpen} onClose={()=>{setRegisterOpen(false);setEditTarget(null)}} onSave={saveParticipant} editData={editTarget}/>
        <ProfileModal open={profileOpen} participant={profileTarget} isAdmin={isAdmin}
          onClose={()=>{setProfileOpen(false);setProfileTarget(null)}}
          onEdit={p=>{setProfileOpen(false);setEditTarget(p);setRegisterOpen(true)}}
          onBMI={p=>{setProfileOpen(false);setBmiTarget(p);setView('bmi')}}/>
        <ConfirmModal open={!!confirmTarget} name={confirmTarget?`${confirmTarget.name} ${confirmTarget.surname}`:''}
          onConfirm={()=>deleteParticipant(confirmTarget.id)} onCancel={()=>setConfirmTarget(null)}/>
      </>
    )
  }

  // ── MAIN VIEW ────────────────────────────────────────────────────
  return (
    <div style={{display:'flex',flexDirection:'column',minHeight:'100vh'}}>
      <Navbar
        onUsers={()=>setView('users')}
        onRegister={()=>{setEditTarget(null);setRegisterOpen(true)}}
        onAdminLogin={()=>setView('adminLogin')}
        session={session}
        isAdmin={isAdmin}
        onAdminLogout={()=>setIsAdmin(false)}
      />

      <div style={{flex:1,overflowY:'auto',padding:'16px 24px'}}>
        <div style={{fontSize:20,fontWeight:700,color:'#F4A33C',textAlign:'center',marginBottom:14}}>Добро пожаловать в Marathon Skills 2026</div>

        {/* Stats */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:6,height:96,marginBottom:12}}>
          {[
            ['🏃', runners,  '#E85D04','#E85D04','Бегунов'],
            ['📋', coords,   '#6C63FF','#6C63FF','Координаторов'],
            ['📊', avgBMI,   '#4CAF50','#4CAF50','Средний ИМТ'],
            ['🌍', topCountry,'#2196F3','#2196F3','Топ страна'],
            ['👥', participants.length,'#9C27B0','#9C27B0','Всего участников'],
          ].map(([icon,val,color,barColor,lbl])=>(
            <div key={lbl} style={{background:'#1E1E36',border:'1px solid #2D2D46',borderRadius:6,position:'relative',overflow:'hidden',display:'flex',alignItems:'center',padding:'0 12px',gap:8}}>
              <span style={{fontSize:20}}>{icon}</span>
              <div>
                <div style={{fontSize:18,fontWeight:700,color}}>{val}</div>
                <div style={{fontSize:9,color:'#8C8CA5'}}>{lbl}</div>
              </div>
              <div style={{position:'absolute',bottom:0,left:8,right:8,height:3,borderRadius:'0 0 6px 6px',background:barColor}}/>
            </div>
          ))}
        </div>

        {/* Hero */}
        <div style={{height:140,borderRadius:10,overflow:'hidden',position:'relative',background:'linear-gradient(to right, rgba(232,93,4,.19), rgba(33,150,243,.06))',marginBottom:12}}>
          <div style={{display:'flex',gap:0,position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-60%)',justifyContent:'center'}}>
            {['/icon1.png','/icon2.png','/icon3.png','/icon4.png','/icon5.png'].map(src=>(
              <div key={src} style={{background:'rgba(255,255,255,.08)',borderRadius:'50%',width:56,height:56,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 10px',border:'2px solid rgba(255,255,255,.15)',overflow:'hidden'}}>
                <img src={src} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
              </div>
            ))}
          </div>
          <div style={{position:'absolute',bottom:12,left:20,fontSize:16,fontWeight:700,opacity:.9}}>42.195 КМ &nbsp;·&nbsp; 15 ИЮНЯ 2026</div>
        </div>

        {/* Quick buttons */}
        <div style={{display:'flex',gap:10,justifyContent:'center',marginBottom:16}}>
          <button style={{...btnOrange,height:40,fontSize:12}} onClick={()=>{setEditTarget(null);setRegisterOpen(true)}}>✚ &nbsp;Зарегистрировать</button>
          <button style={{...btnNav,height:40,fontSize:12}} onClick={()=>setView('users')}>👥 &nbsp;Все участники</button>
        </div>

        {/* Telegram Banner */}
        <a
          href="https://t.me/martthon_bot"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display:'flex', alignItems:'center', gap:14,
            background:'linear-gradient(135deg,#0d1f3c 0%,#1a3a5c 100%)',
            border:'1px solid #2196F3', borderRadius:10, padding:'14px 18px',
            marginBottom:12, textDecoration:'none', cursor:'pointer',
          }}
        >
          <div style={{
            width:44, height:44, borderRadius:'50%', flexShrink:0,
            background:'#2196F3', display:'flex', alignItems:'center',
            justifyContent:'center', fontSize:22,
          }}>✈️</div>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:700,color:'#E8E8F5',marginBottom:3}}>
              Есть вопросы? Спроси бота в Telegram
            </div>
            <div style={{fontSize:10,color:'#8C8CA5'}}>
              Найди участника · Статистика · Помощь
            </div>
          </div>
          <div style={{background:'#2196F3',color:'#fff',borderRadius:6,padding:'6px 14px',fontSize:11,fontWeight:700,flexShrink:0}}>Открыть →</div>
        </a>

        {/* Info cards */}
        {[
          ['#E85D04','🏃 Марафон — испытание воли','Дистанция 42,195 км объединяет профессионалов и любителей в едином порыве выносливости.'],
          ['#2196F3','💪 «Стена» на 30–35 км','В этот момент запасы гликогена истощаются. Преодоление — вопрос чистого упрямства.'],
          ['#4CAF50','🌆 Города без машин','Уникальный шанс увидеть город иначе: пробежать по мостам под крики болельщиков.'],
        ].map(([color,title,desc])=>(
          <div key={title} style={{display:'flex',alignItems:'stretch',background:'#1E1E36',border:'1px solid #28283E',marginBottom:6}}>
            <div style={{width:4,flexShrink:0,background:color}}/>
            <div style={{padding:'10px 12px'}}>
              <div style={{fontSize:12,fontWeight:700,marginBottom:4}}>{title}</div>
              <div style={{fontSize:10,color:'#8C8CA5',lineHeight:1.4}}>{desc}</div>
            </div>
          </div>
        ))}
      </div>

      <TimerBar/>

      <RegisterModal open={registerOpen} onClose={()=>{setRegisterOpen(false);setEditTarget(null)}} onSave={saveParticipant} editData={editTarget}/>
    </div>
  )
}
