import {
  validarRetencion as validar,
  firmarRetencion as firmar,
  recepcionarRetencion as recepcionar,
  autorizarRetencion as autorizar
} from './retencionService.ts';

export const validarRetencion = validar;
export const firmarRetencion = firmar;
export const recepcionarRetencion = recepcionar;
export const autorizarRetencion = autorizar;

export default {
  validarRetencion: validar,
  firmarRetencion: firmar,
  recepcionarRetencion: recepcionar,
  autorizarRetencion: autorizar
};
