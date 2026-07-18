import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, UserPlus, UserCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SalesNoteClientData } from "@/hooks/useSalesNote";

interface CustomerInfoFormProps {
  clientData: SalesNoteClientData;
  setClientData: (data: SalesNoteClientData) => void;
  isConsumidorFinal: boolean;
  handleConsumidorFinal: () => void;
  loadingAction: string | null;
  handleLookupCustomer: () => void;
  handleSaveCustomerToDirectory: () => void;
  isSearchingCedula: boolean;
  fetchCedulaData: (val: string, callback: (data: any) => void) => void;
  docInfo: { text: string; isError: boolean };
}

export function CustomerInfoForm({
  clientData, setClientData,
  isConsumidorFinal, handleConsumidorFinal,
  loadingAction, handleLookupCustomer, handleSaveCustomerToDirectory,
  isSearchingCedula, fetchCedulaData, docInfo
}: CustomerInfoFormProps) {
  return (
    <>
      <div className="flex items-center justify-between border-b pb-4">
        <h2 className="text-xl font-bold text-slate-800">Información del Receptor</h2>
        <div className="flex gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 text-[10px] font-black uppercase"
            onClick={handleLookupCustomer}
            disabled={loadingAction === 'lookup' || !clientData.ruc}
          >
            {loadingAction === 'lookup' ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
            Buscar
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 text-[10px] font-black uppercase text-[#2988a3] hover:text-[#1f6a80]"
            onClick={handleSaveCustomerToDirectory}
            disabled={loadingAction === 'save_customer' || !clientData.name || !clientData.ruc}
          >
            {loadingAction === 'save_customer' ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <UserPlus className="h-3 w-3 mr-1" />}
            Guardar
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        <div className="space-y-2">
          <Label className="font-bold text-slate-700 uppercase text-[10px]">R.U.C / C.I.</Label>
          <div className="flex gap-2">
            <Input 
              placeholder="Identificación" 
              value={clientData.ruc} 
              maxLength={13} 
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                setClientData({...clientData, ruc: val});
                if (val.length === 10) {
                  fetchCedulaData(val, (data) => setClientData({
                    ...clientData, 
                    ruc: val,
                    name: data.name || clientData.name,
                    address: data.address || clientData.address,
                    email: data.email || clientData.email,
                    phone: data.phone || clientData.phone
                  }));
                }
              }}
              className="bg-slate-50 h-11" 
            />
            <Button variant={isConsumidorFinal ? "default" : "outline"} className={cn("h-11 px-3 text-[10px] font-black uppercase", isConsumidorFinal && "bg-[#2988a3] text-white")} onClick={handleConsumidorFinal}><UserCheck className="h-3 w-3 mr-1" /> C. Final</Button>
          </div>
          {docInfo.text && <p className={cn("text-[10px] font-black uppercase pl-1", docInfo.isError ? "text-destructive" : "text-[#2988a3]")}>{docInfo.text}</p>}
        </div>
        <div className="space-y-2">
          <Label className="font-bold text-slate-700 uppercase text-[10px] flex items-center gap-2">
            Nombre:
            {isSearchingCedula && <Loader2 className="h-3 w-3 animate-spin text-[#2988a3]" />}
          </Label>
          <Input placeholder="Nombre completo" value={clientData.name} onChange={(e) => setClientData({...clientData, name: e.target.value})} className="bg-slate-50 h-11" disabled={isConsumidorFinal} />
        </div>
        <div className="space-y-2">
          <Label className="font-bold text-slate-700 uppercase text-[10px]">Email:</Label>
          <Input type="email" placeholder="correo@ejemplo.com" value={clientData.email} onChange={(e) => setClientData({...clientData, email: e.target.value})} className="bg-slate-50 h-11" />
        </div>
        <div className="space-y-2">
          <Label className="font-bold text-slate-700 uppercase text-[10px]">Teléfono:</Label>
          <Input placeholder="0998765432" value={clientData.phone} onChange={(e) => setClientData({...clientData, phone: e.target.value.replace(/\D/g, '')})} className="bg-slate-50 h-11" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label className="font-bold text-slate-700 uppercase text-[10px]">Dirección:</Label>
          <Input placeholder="Calle, Ciudad" value={clientData.address} onChange={(e) => setClientData({...clientData, address: e.target.value})} className="bg-slate-50 h-11" disabled={isConsumidorFinal} />
        </div>
      </div>
    </>
  );
}
