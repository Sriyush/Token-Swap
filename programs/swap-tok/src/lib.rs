pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("3T5VkVogPgq2G3BHfdSqCXt16twvXkcvELRAkutqkbNF");

#[program]
pub mod swap_tok {
    use super::*;

    pub fn make_offer(context: Context<MakeOffer>, id: u64, token_a_offered_amount: u64 , token_b_offered_amount : u64 ) -> Result<()> {
        instructions::make_offers::send_offered_tokens_to_vault(&context , token_a_offered_amount)?;
        instructions::make_offers::save_offer(context , id, token_b_offered_amount)
    }
    pub fn take_offer(context: Context<TakeOffer>) -> Result<()> {
        instructions::take_offer::send_wanted_token_maker(&context)?;
        instructions::take_offer::withdraw_and_Close_vault(context)
    }
}
