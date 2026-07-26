# Estética — Sistema de Fidelización

> Webapp para centros de estética: agenda de turnos, fidelidad por puntos e historial de clientas. MVP pensado para uso real en mostrador: rápido, simple, sin curva de aprendizaje.

![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js%2014-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3fcf8e?style=flat-square&logo=supabase&logoColor=white)
![React](https://img.shields.io/badge/React%2018-61dafb?style=flat-square&logo=react&logoColor=black)
![Vitest](https://img.shields.io/badge/Vitest-6e9f18?style=flat-square&logo=vitest&logoColor=white)

## ✨ Funcionalidades

- 📅 **Agenda de turnos** — gestión de visitas del día a día.
- ⭐ **Fidelidad por puntos** — ledger append-only: cada visita suma puntos, canje de premios, deshacer con reversas compensatorias.
- 🗂️ **Historial de clientas** — registro completo de visitas y servicios.
- 📱 **Mobile-first** — diseñada para que la operadora la use desde el celular, con la clienta enfrente, en segundos.

## 🛠️ Stack

- **Next.js 14** (App Router) + **React 18**
- **TypeScript** estricto
- **Supabase** (Postgres, RLS)
- **Vitest** — dominio puro + tests de integración SQL

## 🏗️ Arquitectura

Hexagonal con núcleo chico: solo el ledger de puntos y sus invariantes viven en el hexágono (`src/domain/`, cero imports de Supabase/Next). El resto es CRUD pragmático. Detalles en [AGENTS.md](AGENTS.md).

## 🚀 Desarrollo

```bash
npm install
npm run dev        # Next.js dev server
npm run typecheck  # tsc --noEmit
npm run test       # vitest run
```

## 📸 Screenshot

![Screenshot de la app](screenshot.png)

## 👤 Autor

**Ivan Paolillo — NRD** · 🇦🇷 Argentina
🌐 [nrd.com.ar](https://nrd.com.ar) · 📧 [Contacto](https://nrd.com.ar/contacto)
