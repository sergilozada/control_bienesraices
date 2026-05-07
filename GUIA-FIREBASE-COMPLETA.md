# 🔥 Guía Completa de Configuración de Firebase

## Paso 1: Crear Cuenta y Proyecto en Firebase

### 1.1 Crear cuenta de Firebase
1. Ve a https://console.firebase.google.com/
2. Haz clic en "Comenzar"
3. Inicia sesión con tu cuenta de Google (o crea una si no tienes)

### 1.2 Crear nuevo proyecto
1. Haz clic en "Crear un proyecto"
2. Nombre del proyecto: `bienes-raices-sistema` (o el nombre que prefieras)
3. Haz clic en "Continuar"
4. **Google Analytics**: Puedes deshabilitarlo por ahora (opcional)
5. Haz clic en "Crear proyecto"
6. Espera a que se cree (puede tomar 1-2 minutos)
7. Haz clic en "Continuar"

## Paso 2: Configurar Authentication (Autenticación)

### 2.1 Habilitar Authentication
1. En el panel izquierdo, haz clic en "Authentication"
2. Haz clic en "Comenzar"
3. Ve a la pestaña "Sign-in method"
4. Haz clic en "Correo electrónico/contraseña"
5. **Habilita** la primera opción (Correo electrónico/contraseña)
6. **NO habilites** la segunda opción (Vínculo de correo electrónico)
7. Haz clic en "Guardar"

### 2.2 Crear usuarios de prueba
1. Ve a la pestaña "Users"
2. Haz clic en "Agregar usuario"
3. Crea estos 3 usuarios:

**Usuario Administrador:**
- Email: `admin@bienesraices.com`
- Contraseña: `password123`
- Haz clic en "Agregar usuario"

**Usuario Normal:**
- Email: `usuario@bienesraices.com`
- Contraseña: `password123`
- Haz clic en "Agregar usuario"

**Usuario Solo Lectura:**
- Email: `readonly@bienesraices.com`
- Contraseña: `password123`
- Haz clic en "Agregar usuario"

## Paso 3: Configurar Firestore Database

### 3.1 Crear base de datos
1. En el panel izquierdo, haz clic en "Firestore Database"
2. Haz clic en "Crear base de datos"
3. **Modo de seguridad**: Selecciona "Comenzar en modo de prueba"
4. Haz clic en "Siguiente"
5. **Ubicación**: Selecciona `us-central1` (recomendado para Latinoamérica)
6. Haz clic en "Listo"
7. Espera a que se cree la base de datos

### 3.2 Configurar reglas de seguridad
1. Ve a la pestaña "Reglas"
2. Reemplaza todo el contenido con estas reglas:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Los usuarios solo pueden acceder a sus propios clientes
    match /clients/{document} {
      allow read, write: if request.auth != null && 
        request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && 
        request.auth.uid == request.resource.data.userId;
    }
    
    // Permitir acceso general para usuarios autenticados
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

3. Haz clic en "Publicar"

## Paso 4: Obtener Configuración del Proyecto

### 4.1 Registrar aplicación web
1. En la página principal del proyecto, haz clic en el ícono web `</>`
2. **Nombre de la aplicación**: `Sistema Bienes Raices Web`
3. **NO marques** "También configurar Firebase Hosting"
4. Haz clic en "Registrar aplicación"

### 4.2 Copiar configuración
1. Aparecerá un código de configuración como este:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyC...",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto-id",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
```

2. **COPIA TODA ESTA CONFIGURACIÓN** - la necesitarás en el siguiente paso

### 4.3 Actualizar archivo de configuración
1. Abre el archivo `src/lib/firebase.ts` en tu proyecto
2. Reemplaza la configuración existente con la tuya:

```typescript
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// TU CONFIGURACIÓN AQUÍ (reemplaza con los datos que copiaste)
const firebaseConfig = {
  apiKey: "TU-API-KEY-AQUI",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto-id",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "tu-app-id"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar servicios
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
```

3. Guarda el archivo

## Paso 5: Probar la Configuración

### 5.1 Ejecutar el proyecto
1. Abre una terminal en tu proyecto
2. Ejecuta: `pnpm run dev`
3. Abre tu navegador en `http://localhost:5173`

### 5.2 Probar Firebase
1. Deberías ver la pantalla de selección de modo
2. Haz clic en "🔥 Modo Firebase (Nube)"
3. Deberías ver la pantalla de login de Firebase
4. Haz clic en uno de los botones de usuario de prueba
5. Intenta iniciar sesión con:
   - Email: `admin@bienesraices.com`
   - Contraseña: `password123`

### 5.3 Verificar funcionalidad
1. Si el login es exitoso, verás el dashboard
2. Intenta crear un cliente nuevo
3. Ve a Firebase Console > Firestore Database
4. Deberías ver una colección "clients" con tu nuevo registro

## Paso 6: Configurar Firebase Hosting (Opcional)

### 6.1 Instalar Firebase CLI
```bash
npm install -g firebase-tools
```

### 6.2 Iniciar sesión
```bash
firebase login
```

### 6.3 Inicializar hosting
```bash
firebase init hosting
```

Selecciona:
- Proyecto existente
- Directorio público: `dist`
- SPA (single-page app): `Yes`
- Sobrescribir index.html: `No`

### 6.4 Desplegar
```bash
pnpm run build
firebase deploy
```

## 🎉 ¡Configuración Completada!

Tu sistema ahora está funcionando con Firebase. Los datos se guardan en la nube y puedes acceder desde cualquier dispositivo.

## Solución de Problemas Comunes

### Error: "Firebase config is not defined"
- Verifica que copiaste correctamente la configuración en `src/lib/firebase.ts`

### Error: "Permission denied"
- Verifica que las reglas de Firestore estén configuradas correctamente
- Asegúrate de estar logueado con un usuario válido

### Error: "Auth domain not whitelisted"
- Ve a Authentication > Settings > Authorized domains
- Agrega tu dominio local: `localhost`

### No puedo crear usuarios
- Verifica que Authentication esté habilitado
- Verifica que "Correo electrónico/contraseña" esté habilitado

## Próximos Pasos Recomendados

1. **Cambiar contraseñas**: Cambia las contraseñas de los usuarios de prueba
2. **Configurar dominios**: Agrega tu dominio de producción a Firebase
3. **Backup**: Configura backups automáticos de Firestore
4. **Monitoreo**: Habilita Analytics para monitorear uso

¡Tu sistema ya está en la nube! 🚀