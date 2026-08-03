
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck, User, LogIn, Loader2, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useFirestore } from "@/firebase";
import { collection, query, where, getDocs, addDoc, serverTimestamp } from "firebase/firestore";

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const db = useFirestore();
  const [role, setRole] = useState<'admin' | 'sales'>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (role === 'admin') {
        if (email === 'administrador@amecindustrias.com' && password === 'amec123') {
          localStorage.setItem('amec_user_role', 'admin');
          localStorage.setItem('amec_user_name', 'Administrador');
          router.push('/dashboard/admin');
          toast({ title: "Bienvenido, Administrador", description: "Acceso concedido." });
        } else {
          throw new Error("Credenciales de administrador incorrectas.");
        }
      } else {
        const salespeopleRef = collection(db, "salespeople");
        const q = query(
          salespeopleRef,
          where("email", "==", email),
          where("password", "==", password),
          where("status", "==", "Activo")
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const userData = querySnapshot.docs[0].data();
          localStorage.setItem('amec_user_role', 'sales');
          localStorage.setItem('amec_user_name', userData.name || 'Vendedor');
          router.push('/dashboard/sales');
          toast({ title: "Bienvenido, Vendedor", description: "Acceso verificado desde Firestore." });
        } else {
          throw new Error("Vendedor no encontrado o cuenta inactiva.");
        }
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error de acceso",
        description: error.message || "No se pudo iniciar sesión.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!name || !email || !password) {
        throw new Error("Todos los campos son obligatorios.");
      }

      const salespeopleRef = collection(db, "salespeople");

      const q = query(salespeopleRef, where("email", "==", email));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        throw new Error("Este correo ya está registrado.");
      }

      const userData = {
        name,
        email,
        password,
        status: "Activo",
        createdAt: serverTimestamp()
      };

      await addDoc(salespeopleRef, userData);

      toast({
        title: "Cuenta creada",
        description: "Ya puedes iniciar sesión como vendedor con tus credenciales."
      });

      setName('');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error de registro",
        description: error.message || "No se pudo crear la cuenta.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background font-body">
      <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in-95 duration-500">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="relative h-40 w-40 drop-shadow-xl bg-white/50 rounded-3xl p-4">
              <Image
                src="/Amec.jpeg"
                alt="Logo Apm Inox"
                fill
                className="object-contain p-2"
                priority
              />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-foreground">Apm Inox Billing</h1>
            <p className="text-muted-foreground font-medium">Gestión Inteligente de Facturación</p>
          </div>
        </div>

        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4 bg-muted/50 p-1 rounded-xl">
            <TabsTrigger value="login" className="font-bold rounded-lg">Ingresar</TabsTrigger>
            <TabsTrigger value="register" className="font-bold rounded-lg">Registrarse</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <Card className="border-none shadow-2xl bg-card/80 backdrop-blur-sm rounded-2xl overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                <CardTitle className="text-xl">Bienvenido</CardTitle>
                <CardDescription>Ingrese sus credenciales de acceso</CardDescription>
              </CardHeader>
              <form onSubmit={handleLogin}>
                <CardContent className="space-y-6 pt-6">
                  <div className="space-y-2">
                    <Label htmlFor="email">Correo electrónico</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="ejemplo@apminox.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="rounded-xl h-11 border-slate-200 focus:ring-primary/20"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Contraseña</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="rounded-xl h-11 border-slate-200 focus:ring-primary/20"
                      required
                    />
                  </div>

                  <div className="space-y-3">
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Seleccione su rol</Label>
                    <RadioGroup
                      defaultValue="admin"
                      onValueChange={(v) => setRole(v as any)}
                      className="grid grid-cols-2 gap-4"
                    >
                      <div>
                        <RadioGroupItem value="admin" id="role-admin" className="peer sr-only" />
                        <Label
                          htmlFor="role-admin"
                          className="flex flex-col items-center justify-center rounded-xl border-2 border-muted bg-popover p-3 hover:bg-slate-50 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-all"
                        >
                          <ShieldCheck className="mb-1 h-5 w-5" />
                          <span className="font-bold text-[10px] uppercase">Admin</span>
                        </Label>
                      </div>
                      <div>
                        <RadioGroupItem value="sales" id="role-sales" className="peer sr-only" />
                        <Label
                          htmlFor="role-sales"
                          className="flex flex-col items-center justify-center rounded-xl border-2 border-muted bg-popover p-3 hover:bg-slate-50 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-all"
                        >
                          <User className="mb-1 h-5 w-5" />
                          <span className="font-bold text-[10px] uppercase">Vendedor</span>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                </CardContent>
                <CardFooter className="bg-slate-50/50 border-t border-slate-100 pt-6">
                  <Button type="submit" className="w-full h-12 rounded-xl font-bold text-base shadow-lg shadow-primary/20" disabled={loading}>
                    {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <LogIn className="mr-2 h-5 w-5" />}
                    Iniciar Sesión
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </TabsContent>

          <TabsContent value="register">
            <Card className="border-none shadow-2xl bg-card/80 backdrop-blur-sm rounded-2xl overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100">
                <CardTitle className="text-xl">Nueva Cuenta</CardTitle>
                <CardDescription>Regístrate como vendedor en Apm Inox</CardDescription>
              </CardHeader>
              <form onSubmit={handleRegister}>
                <CardContent className="space-y-4 pt-6">
                  <div className="space-y-2">
                    <Label htmlFor="reg-name">Nombre Completo</Label>
                    <Input
                      id="reg-name"
                      placeholder="Ej: Roberto Sánchez"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="rounded-xl h-11 border-slate-200"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-email">Correo Electrónico</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      placeholder="vendedor@apminox.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="rounded-xl h-11 border-slate-200"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">Contraseña de Acceso</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="rounded-xl h-11 border-slate-200"
                      required
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground italic px-1 bg-amber-50 p-2 rounded-lg border border-amber-100">
                    Nota: Al registrarte, tu cuenta quedará vinculada automáticamente a la base de datos de Apm Inox.
                  </p>
                </CardContent>
                <CardFooter className="bg-slate-50/50 border-t border-slate-100 pt-6">
                  <Button type="submit" variant="secondary" className="w-full h-12 rounded-xl font-bold text-base border-2 border-slate-200" disabled={loading}>
                    {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <UserPlus className="mr-2 h-5 w-5" />}
                    Crear mi Cuenta
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="text-center space-y-4">
          <div className="pt-4 border-t border-muted/20">
            <p className="text-[10px] font-black uppercase text-slate-400/80 tracking-widest">
              Desarrollado por Palma Nexus Solutions
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
