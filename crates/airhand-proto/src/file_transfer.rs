//! WMK Remote Support - contrato inicial para transferência autenticada de arquivos.
//!
//! IMPORTANTE: este módulo define mensagens e validações, NÃO concede acesso ao disco
//! e NÃO implementa por si só o envio/recebimento pela sessão remota.
//! Cada operação deverá ser autorizada pelo host, ligada a uma sessão autenticada,
//! e executada exclusivamente dentro de um diretório permitido.
//! O transporte é versionado separadamente para não confundir clientes antigos.

use minicbor::{Decode, Encode};
use std::path::{Component, Path};

/// O máximo de um bloco de dados (256 KiB) evita carregar arquivos inteiros na RAM.
pub const MAX_FILE_CHUNK: usize = 256 * 1024;
/// Evita nomes absurdamente extensos e mensagens gigantescas.
pub const MAX_FILE_NAME_BYTES: usize = 255;
/// Tamanho máximo da representação de um caminho relativo no protocolo.
pub const MAX_RELATIVE_PATH_BYTES: usize = 2048;

/// Erros de validação. Não contêm caminhos absolutos do computador do cliente.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileValidationError {
    InvalidPath,
    InvalidName,
    ChunkTooLarge,
    EmptyChunk,
}

/// Mensagens de negociação. A presença da enum NÃO habilita operações remotas.
#[derive(Encode, Decode, Debug, Clone, PartialEq, Eq)]
pub enum FileTransferMessage {
    /// Pedido de acesso temporário a uma pasta explicitamente escolhida pelo host.
    #[n(0)]
    RequestAccess {
        #[n(0)] request_id: u64,
        #[n(1)] can_upload: bool,
        #[n(2)] can_download: bool,
    },
    /// Resultado da autorização do host, sem revelar o caminho absoluto local.
    #[n(1)]
    AccessDecision {
        #[n(0)] request_id: u64,
        #[n(1)] granted: bool,
        #[n(2)] scope_id: u64,
    },
    /// Solicitação de listagem paginada dentro do escopo autorizado.
    #[n(2)]
    List {
        #[n(0)] request_id: u64,
        #[n(1)] scope_id: u64,
        #[n(2)] relative_path: String,
        #[n(3)] page: u32,
    },
    /// Transferência solicitada após consentimento: direction=0 upload, 1 download.
    #[n(3)]
    Offer {
        #[n(0)] transfer_id: u64,
        #[n(1)] scope_id: u64,
        #[n(2)] relative_path: String,
        #[n(3)] length: u64,
        /// Digest SHA-256 de 32 bytes; calculado sobre o arquivo inteiro.
        #[n(4)] sha256: Vec<u8>,
        #[n(5)] direction: u8,
    },
    /// Resposta de aceite da operação individual.
    #[n(4)]
    Decision {
        #[n(0)] transfer_id: u64,
        #[n(1)] accepted: bool,
    },
    /// Bloco binário; nunca codificar conteúdo em texto/base64.
    #[n(5)]
    Chunk {
        #[n(0)] transfer_id: u64,
        #[n(1)] offset: u64,
        #[n(2)] data: Vec<u8>,
    },
    /// Confirmação de bytes recebidos para progresso/retomada autenticada.
    #[n(6)]
    Ack {
        #[n(0)] transfer_id: u64,
        #[n(1)] next_offset: u64,
    },
    /// Encerramento, cancelamento ou revogação.
    #[n(7)]
    Cancel {
        #[n(0)] transfer_id: u64,
    },
    /// Indica conclusão; destino deve conferir quantidade de bytes e SHA-256.
    #[n(8)]
    Complete {
        #[n(0)] transfer_id: u64,
        #[n(1)] succeeded: bool,
    },
}

/// Não basta checar este caminho: o host deve ainda usar caminho canônico
/// e impedir symlinks/reparse points que escapem da raiz escolhida.
pub fn validate_relative_path(value: &str) -> Result<(), FileValidationError> {
    if value.is_empty() || value.len() > MAX_RELATIVE_PATH_BYTES || value.contains('\0') {
        return Err(FileValidationError::InvalidPath);
    }
    // Rejeitar separadores Windows em qualquer SO, nomes de drive e UNC.
    if value.contains('\\') || value.contains(':') || value.starts_with('/') {
        return Err(FileValidationError::InvalidPath);
    }
    let path = Path::new(value);
    if !path.components().all(|part| matches!(part, Component::Normal(_))) {
        return Err(FileValidationError::InvalidPath);
    }
    if value.split('/').any(|part| part.is_empty() || part == "." || part == ".." ||
        part.len() > MAX_FILE_NAME_BYTES || part.trim_end_matches(['.', ' ']) != part) {
        return Err(FileValidationError::InvalidPath);
    }
    Ok(())
}

pub fn validate_file_name(name: &str) -> Result<(), FileValidationError> {
    validate_relative_path(name).map_err(|_| FileValidationError::InvalidName)?;
    if name.contains('/') || name.chars().any(|c| c.is_control()) {
        return Err(FileValidationError::InvalidName);
    }
    // Reserva de dispositivos Windows; impedir caminhos como CON.txt, NUL e COM1.
    let base = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5",
        "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4",
        "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"].contains(&base.as_str()) {
        return Err(FileValidationError::InvalidName);
    }
    Ok(())
}

pub fn validate_chunk(data: &[u8]) -> Result<(), FileValidationError> {
    if data.is_empty() {
        Err(FileValidationError::EmptyChunk)
    } else if data.len() > MAX_FILE_CHUNK {
        Err(FileValidationError::ChunkTooLarge)
    } else {
        Ok(())
    }
}

/// Limites conservadores; um aplicativo pode escolher cotas menores por cliente.
pub const MAX_ACTIVE_TRANSFERS: usize = 4;

/// Uma autorização não é global: vale somente para o escopo concedido pelo host
/// e para as direções aceitas. A implementação de disco continua separada.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GrantedScope {
    pub id: u64,
    pub allow_upload: bool,
    pub allow_download: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransferGuardError {
    Unauthorized,
    InvalidDirection,
    InvalidHash,
    InvalidPath,
    LimitExceeded,
    UnknownTransfer,
    NotApproved,
    OffsetMismatch,
    InvalidChunk,
    Incomplete,
    DuplicateTransfer,
}

/// Máquina de estados de autorização e progresso. Não armazena conteúdo,
/// não toca o disco e não confia em offsets/nomes enviados pela outra ponta.
#[derive(Default)]
pub struct TransferGuard {
    scopes: std::collections::HashMap<u64, GrantedScope>,
    transfers: std::collections::HashMap<u64, TransferState>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TransferState {
    size: u64,
    next_offset: u64,
    approved: bool,
    scope_id: u64,
}

impl TransferGuard {
    /// Chamar APENAS depois de a interface do host confirmar a autorização.
    pub fn grant(&mut self, scope: GrantedScope) {
        self.scopes.insert(scope.id, scope);
    }

    /// O host pode revogar a qualquer momento; todas as transferências caem.
    pub fn revoke(&mut self, scope_id: u64) {
        self.scopes.remove(&scope_id);
        self.transfers.retain(|_, t| t.scope_id != scope_id);
    }

    /// direction: 0 = técnico → host, 1 = host → técnico.
    pub fn offer(
        &mut self,
        transfer_id: u64,
        scope_id: u64,
        direction: u8,
        relative_path: &str,
        size: u64,
        expected_sha256: &[u8],
    ) -> Result<(), TransferGuardError> {
        let scope = self.scopes.get(&scope_id).ok_or(TransferGuardError::Unauthorized)?;
        let allowed = match direction {
            0 => scope.allow_upload,
            1 => scope.allow_download,
            _ => return Err(TransferGuardError::InvalidDirection),
        };
        if !allowed {
            return Err(TransferGuardError::Unauthorized);
        }
        validate_relative_path(relative_path).map_err(|_| TransferGuardError::InvalidPath)?;
        for part in relative_path.split('/') {
            validate_file_name(part).map_err(|_| TransferGuardError::InvalidPath)?;
        }
        if expected_sha256.len() != 32 {
            return Err(TransferGuardError::InvalidHash);
        }
        if self.transfers.contains_key(&transfer_id) {
            return Err(TransferGuardError::DuplicateTransfer);
        }
        if self.transfers.len() >= MAX_ACTIVE_TRANSFERS || size == 0 {
            return Err(TransferGuardError::LimitExceeded);
        }
        self.transfers.insert(transfer_id, TransferState {
            size,
            next_offset: 0,
            approved: false,
            scope_id,
        });
        Ok(())
    }

    pub fn approve(&mut self, transfer_id: u64) -> Result<(), TransferGuardError> {
        let state = self.transfers.get_mut(&transfer_id)
            .ok_or(TransferGuardError::UnknownTransfer)?;
        if !self.scopes.contains_key(&state.scope_id) {
            return Err(TransferGuardError::Unauthorized);
        }
        state.approved = true;
        Ok(())
    }

    /// Valida somente os metadados do bloco. O host deve gravar em arquivo
    /// temporário e conferir SHA-256 real antes de confirmar a conclusão.
    pub fn chunk(
        &mut self,
        transfer_id: u64,
        offset: u64,
        bytes: &[u8],
    ) -> Result<u64, TransferGuardError> {
        let state = self.transfers.get_mut(&transfer_id)
            .ok_or(TransferGuardError::UnknownTransfer)?;
        if !self.scopes.contains_key(&state.scope_id) {
            return Err(TransferGuardError::Unauthorized);
        }
        if !state.approved {
            return Err(TransferGuardError::NotApproved);
        }
        validate_chunk(bytes).map_err(|_| TransferGuardError::InvalidChunk)?;
        if offset != state.next_offset {
            return Err(TransferGuardError::OffsetMismatch);
        }
        let end = offset.checked_add(bytes.len() as u64)
            .ok_or(TransferGuardError::LimitExceeded)?;
        if end > state.size {
            return Err(TransferGuardError::LimitExceeded);
        }
        state.next_offset = end;
        Ok(end)
    }

    /// Só confirma se a quantidade exata chegou; o executor de disco deve
    /// conferir também o SHA-256 antes de chamar esta função.
    pub fn complete(&mut self, transfer_id: u64) -> Result<(), TransferGuardError> {
        let state = self.transfers.get(&transfer_id)
            .ok_or(TransferGuardError::UnknownTransfer)?;
        if !state.approved || state.next_offset != state.size {
            return Err(TransferGuardError::Incomplete);
        }
        self.transfers.remove(&transfer_id);
        Ok(())
    }

    pub fn cancel(&mut self, transfer_id: u64) {
        self.transfers.remove(&transfer_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn safe_paths() {
        for path in ["Backup/2026/nota.xml", "Dados.dbf", "Arquivos/Relatório.pdf"] {
            assert!(validate_relative_path(path).is_ok(), "{path}");
        }
        for path in ["", "../senhas.txt", "pasta/../arquivo", "./pasta", "/etc/passwd",
            "C:/Windows/win.ini", "\\\\servidor\\share", "pasta//arquivo",
            "pasta/arquivo.", "pasta/arquivo ", "pasta\\arquivo"] {
            assert!(validate_relative_path(path).is_err(), "{path}");
        }
    }
    #[test]
    fn safe_names() {
        assert!(validate_file_name("DANFE-123.xml").is_ok());
        assert!(validate_file_name("Dados.fpt").is_ok());
        for name in ["CON", "NUL.txt", "../secreto", "a/b", "a\\b", "", "arquivo."] {
            assert!(validate_file_name(name).is_err(), "{name}");
        }
    }
    #[test]
    fn bounded_chunks() {
        assert!(validate_chunk(&vec![7; MAX_FILE_CHUNK]).is_ok());
        assert_eq!(validate_chunk(&[]), Err(FileValidationError::EmptyChunk));
        assert_eq!(validate_chunk(&vec![1; MAX_FILE_CHUNK + 1]),
            Err(FileValidationError::ChunkTooLarge));
    }
    #[test]
    fn cbor_roundtrip_binary_file_chunk() {
        let msg = FileTransferMessage::Chunk {
            transfer_id: 42,
            offset: 256 * 1024,
            data: vec![0, 1, 255, 17],
        };
        let encoded = minicbor::to_vec(&msg).unwrap();
        let decoded: FileTransferMessage = minicbor::decode(&encoded).unwrap();
        assert_eq!(msg, decoded);
    }
    #[test]
    fn cbor_roundtrip_offer() {
        let msg = FileTransferMessage::Offer {
            transfer_id: 7,
            scope_id: 4,
            relative_path: "NFe/3526.xml".into(),
            length: 1_000_000,
            sha256: vec![0xAB; 32],
            direction: 1,
        };
        let decoded: FileTransferMessage =
            minicbor::decode(&minicbor::to_vec(&msg).unwrap()).unwrap();
        assert_eq!(decoded, msg);
    }

    #[test]
    fn must_authorize_each_transfer() {
        let mut g = TransferGuard::default();
        let sha = [0xBB; 32];
        assert_eq!(g.offer(7, 11, 0, "NFe/arquivo.xml", 4, &sha),
            Err(TransferGuardError::Unauthorized));
        g.grant(GrantedScope { id: 11, allow_upload: true, allow_download: false });
        assert_eq!(g.offer(7, 11, 1, "NFe/arquivo.xml", 4, &sha),
            Err(TransferGuardError::Unauthorized));
        g.offer(7, 11, 0, "NFe/arquivo.xml", 4, &sha).unwrap();
        assert_eq!(g.chunk(7, 0, &[1]), Err(TransferGuardError::NotApproved));
        g.approve(7).unwrap();
        assert_eq!(g.chunk(7, 0, &[1,2]), Ok(2));
        assert_eq!(g.chunk(7, 0, &[3]), Err(TransferGuardError::OffsetMismatch));
        assert_eq!(g.complete(7), Err(TransferGuardError::Incomplete));
        assert_eq!(g.chunk(7, 2, &[3,4]), Ok(4));
        g.complete(7).unwrap();
        assert_eq!(g.chunk(7, 4, &[5]), Err(TransferGuardError::UnknownTransfer));
    }

    #[test]
    fn revocation_stops_all_transfers() {
        let mut g = TransferGuard::default();
        g.grant(GrantedScope { id: 3, allow_upload: true, allow_download: true });
        g.offer(10, 3, 0, "Atualizacao.zip", 3, &[3; 32]).unwrap();
        g.approve(10).unwrap();
        g.revoke(3);
        assert_eq!(g.chunk(10, 0, &[1]), Err(TransferGuardError::UnknownTransfer));
        assert_eq!(g.offer(11, 3, 0, "Atualizacao.zip", 3, &[3; 32]),
            Err(TransferGuardError::Unauthorized));
    }

}
