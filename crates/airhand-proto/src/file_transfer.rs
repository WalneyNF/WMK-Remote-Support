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
}
